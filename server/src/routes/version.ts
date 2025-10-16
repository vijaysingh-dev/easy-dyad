import { Router } from 'express';
import logger from '../logger';
import { type Version, type BranchResult } from '../ipc/ipc_types';
import { db } from '../db';
import { eq } from 'drizzle-orm';
import * as git from 'isomorphic-git';
import * as fs from 'fs';
import path from 'path';
import { getDyadAppPath } from '../../../shared/lib/paths';
import { apps } from '../db/schema';
import { gitCheckout } from '../ipc/utils/git_utils';
import { IS_TEST_BUILD } from "../ipc/utils/test_utils";
import { storeDbTimestampAtCurrentVersion } from '../utils/neon_timestamp_utils';

const router = Router();

// Version related routes
router.get('/does-release-note-exist', async (req, res) => {
        const { version } = req.params;

        if (!version || typeof version !== "string") {
          res.status(400).end();
          return;
        }

        // For E2E tests, we don't want to check for release notes
        // or show release notes, as it interferes with the tests.
        if (IS_TEST_BUILD) {
          res.status(404).end();
          return;
        }
        const releaseNoteUrl = `https://www.dyad.sh/docs/releases/${version}`;

        logger.debug(`Checking for release note at: ${releaseNoteUrl}`);

        try {
          const response = await fetch(releaseNoteUrl, { method: "HEAD" }); // Use HEAD to check existence without downloading content
          if (response.ok) {
            logger.debug(
              `Release note found for version ${version} at ${releaseNoteUrl}`,
            );
            res.setHeader('X-Release-Note-Url', releaseNoteUrl).status(200).end();
          } else if (response.status === 404) {
            logger.debug(
              `Release note not found for version ${version} at ${releaseNoteUrl}`,
            );
            res.status(404).end();
          } else {
            // Log other non-404 errors but still treat as "not found" for the client,
            // as the primary goal is to check existence.
            logger.warn(
              `Unexpected status code ${response.status} when checking for release note: ${releaseNoteUrl}`,
            );
            res.status(404).end();
          }
        } catch (error) {
          logger.error(
            `Error fetching release note for version ${version} at ${releaseNoteUrl}:`,
            error,
          );
          // In case of network errors, etc., assume it doesn't exist or is inaccessible.
          // Throwing an error here would propagate to the client and might be too disruptive
          // if the check is just for UI purposes (e.g., showing a link).
          // Consider if specific errors should be thrown based on requirements.
          res.status(404).end();
        }
})

// List versions
router.get('/:appId/versions', async (req, res) => {
  try {
    const appId = parseInt(req.params.appId);
    const app = await db.query.apps.findFirst({
      where: eq(apps.id, appId)
    });

    if (!app) {
      return res.json([]); // Return empty array if app not found
    }

    const appPath = getDyadAppPath(app.path);

    // Return empty array if not a git repo
    if (!fs.existsSync(path.join(appPath, '.git'))) {
      return res.json([]);
    }

    const commits = await git.log({
      fs,
      dir: appPath,
      depth: 100_000 // Limit to last 100k commits for performance
    });

    const versions: Version[] = commits.map(commit => ({
      oid: commit.oid,
      message: commit.commit.message,
      author: commit.commit.author.name,
      date: new Date(commit.commit.author.timestamp * 1000).toISOString(),
      timestamp: commit.commit.author.timestamp * 1000
    }));

    res.json(versions);
  } catch (error) {
    logger.error('Error listing versions:', error);
    res.status(500).json({ error: 'Failed to list versions' });
  }
});

// Revert version
router.post('/:appId/versions/:versionId/revert', async (req, res) => {
  try {
    const appId = parseInt(req.params.appId);
    const { versionId } = req.params;

    if (isNaN(appId)) {
      return res.status(400).json({ error: 'Invalid app ID' });
    }

    const app = await db.query.apps.findFirst({
      where: eq(apps.id, appId)
    });

    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }

    const appPath = getDyadAppPath(app.path);

    // Stage all files to revert
    await git.add({
      fs,
      dir: appPath,
      filepath: '.'
    });

    // Create revert commit
    await git.commit({
      fs,
      dir: appPath,
      message: `Revert to version ${versionId}`,
      ref: 'HEAD'
    });

    // Store database timestamp for this version
    await storeDbTimestampAtCurrentVersion({ appId });

    res.json({ success: true });
  } catch (error) {
    logger.error('Error reverting version:', error);
    res.status(500).json({ error: 'Failed to revert version' });
  }
});

// Checkout version
router.post('/:appId/versions/:versionId/checkout', async (req, res) => {
  try {
    const appId = parseInt(req.params.appId);
    const { versionId } = req.params;

    if (isNaN(appId)) {
      return res.status(400).json({ error: 'Invalid app ID' });
    }

    const app = await db.query.apps.findFirst({
      where: eq(apps.id, appId)
    });

    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }

    const appPath = getDyadAppPath(app.path);

    // Checkout the specified version
    await gitCheckout({
      path: appPath,
      ref: versionId
    });

    // Store database timestamp for this version
    await storeDbTimestampAtCurrentVersion({ appId });

    res.json({ success: true });
  } catch (error) {
    logger.error('Error checking out version:', error);
    res.status(500).json({ error: 'Failed to checkout version' });
  }
});

// Get current branch
router.get('/:appId/branch', async (req, res) => {
  try {
    const appId = parseInt(req.params.appId);

    if (isNaN(appId)) {
      return res.status(400).json({ error: 'Invalid app ID' });
    }

    const app = await db.query.apps.findFirst({
      where: eq(apps.id, appId)
    });

    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }

    const appPath = getDyadAppPath(app.path);

    // Get the current branch
    const currentBranch = await git.currentBranch({
      fs,
      dir: appPath,
      fullname: false
    });

    // Get all branches
    const branches = await git.listBranches({
      fs,
      dir: appPath
    });

    res.json({
      currentBranch: currentBranch || 'main',
      branches: branches
    });
  } catch (error) {
    logger.error('Error getting current branch:', error);
    res.status(500).json({ error: 'Failed to get current branch' });
  }
});

// Rename branch
router.put('/:appId/branch/rename', async (req, res) => {
  try {
    const appId = parseInt(req.params.appId);
    const { oldName, newName } = req.body;

    if (isNaN(appId)) {
      return res.status(400).json({ error: 'Invalid app ID' });
    }

    if (!oldName || !newName) {
      return res.status(400).json({ error: 'Both old and new branch names are required' });
    }

    const app = await db.query.apps.findFirst({
      where: eq(apps.id, appId)
    });

    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }

    const appPath = getDyadAppPath(app.path);

    // Check if old branch exists
    const branches = await git.listBranches({
      fs,
      dir: appPath
    });

    if (!branches.includes(oldName)) {
      return res.status(404).json({ error: 'Branch not found' });
    }

    // Check if new branch name already exists
    if (branches.includes(newName)) {
      return res.status(400).json({ error: 'Branch with new name already exists' });
    }

    // Create new branch at the same commit
    const oldRef = await git.resolveRef({ fs, dir: appPath, ref: oldName });
    await git.branch({ fs, dir: appPath, ref: newName, object: oldRef });

    // If the old branch was current, switch to the new branch
    const currentBranch = await git.currentBranch({ fs, dir: appPath, fullname: false });
    if (currentBranch === oldName) {
      await gitCheckout({ path: appPath, ref: newName });
    }

    // Delete old branch
    await git.deleteRef({ fs, dir: appPath, ref: `refs/heads/${oldName}` });

    res.json({ success: true });
  } catch (error) {
    logger.error('Error renaming branch:', error);
    res.status(500).json({ error: 'Failed to rename branch' });
  }
});

// System routes
router.post('/restart-dyad', async (_req, res) => {
  try {
    // For security reasons, we'll only allow restarting in development mode
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Restart not allowed in production mode' });
    }

    // Schedule a restart after sending the response
    setTimeout(() => {
      process.exit(0); // Process manager should restart the application
    }, 1000);

    res.json({ success: true });
  } catch (error) {
    logger.error('Error restarting dyad:', error);
    res.status(500).json({ error: 'Failed to restart dyad' });
  }
});

// Get app version
router.get("/version", async (_req, res) => {
  try {
    // Get version from package.json
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { version } = require(path.join(__dirname, "../../../package.json"));
    res.json({ version });
  } catch (error) {
    logger.error("Error getting app version:", error);
    res.status(500).json({ error: "Failed to get app version" });
  }
});

// File system routes
router.post('/show-item', async (req, res) => {
  try {
    const { fullPath } = req.body;

    if (!fullPath) {
      return res.status(400).json({ error: 'Path is required' });
    }

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Path not found' });
    }

    // Show item in folder using Electron's shell
    const { shell } = require('electron');
    await shell.showItemInFolder(fullPath);

    res.json({ success: true });
  } catch (error) {
    logger.error('Error showing item in folder:', error);
    res.status(500).json({ error: 'Failed to show item in folder' });
  }
});

export default router;