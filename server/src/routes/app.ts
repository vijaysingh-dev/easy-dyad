import { Router } from 'express';
import logger from '../logger';
import { db } from '../db';
import { apps, chats, messages } from '../db/schema';
import { desc, eq, like } from 'drizzle-orm';
import * as git from 'isomorphic-git';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { getDyadAppPath, getUserDataPath } from '../../../shared/lib/paths';
import { AppSearchResult } from '../lib/schemas';
import { getEnvVar } from '../utils/read_env';
import { deploySupabaseFunctions } from '../supabase_admin/supabase_management_client';
import { isServerFunction } from '../supabase_admin/supabase_utils';
import { storeDbTimestampAtCurrentVersion } from '../utils/neon_timestamp_utils';
import { type CreateAppParams, type App } from '../ipc/ipc_types';
import { createFromTemplate } from "../ipc/handlers/createFromTemplate";
import { readSettings } from '../../../shared/settings';
import { gitCommit } from '../ipc/utils/git_utils';
import {
  runningApps,
  processCounter,
  removeAppIfCurrentProcess,
  stopAppByInfo
} from '../ipc/utils/process_manager';
import { getFilesRecursively } from '../ipc/utils/file_utils';
import { getSupabaseProjectName } from '../supabase_admin/supabase_management_client';
import { getVercelTeamSlug } from '../ipc/utils/vercel_utils';
import { normalizePath } from '../../../shared/normalizePath';
import { type CreateAppParams, type App } from '../ipc/ipc_types';
import util from 'util';
import killPort from 'kill-port';

const router = Router();

// Create a new app with an initial chat
router.post('/create-app', async (req, res) => {
  try {
    const params: CreateAppParams = req.body;
      const appPath = params.name;
      const fullAppPath = getDyadAppPath(appPath);
      if (fs.existsSync(fullAppPath)) {
        throw new Error(`App already exists at: ${fullAppPath}`);
      }
      // Create a new app
      const [app] = await db
        .insert(apps)
        .values({
          name: params.name,
          // Use the name as the path for now
          path: appPath,
        })
        .returning();

      // Create an initial chat for this app
      const [chat] = await db
        .insert(chats)
        .values({
          appId: app.id,
        })
        .returning();

      await createFromTemplate({
        fullAppPath,
      });

      // Initialize git repo and create first commit
      await git.init({
        fs: fs,
        dir: fullAppPath,
        defaultBranch: "main",
      });

      // Stage all files
      await git.add({
        fs: fs,
        dir: fullAppPath,
        filepath: ".",
      });

      // Create initial commit
      const commitHash = await gitCommit({
        path: fullAppPath,
        message: "Init Dyad app",
      });

      // Update chat with initial commit hash
      await db
        .update(chats)
        .set({
          initialCommitHash: commitHash,
        })
        .where(eq(chats.id, chat.id));

      res.json( { app, chatId: chat.id });
  } catch (error) {
    logger.error('Error creating app:', error);
    res.status(500).json({ error: 'Failed to create app' });
  }
});

// Get app by ID
router.get('/:appId', async (req, res) => {
  try {
    const appId = parseInt(req.params.appId);
    const app = await db.query.apps.findFirst({
      where: eq(apps.id, appId)
    });

    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }

    // Get app files
    const appPath = getDyadAppPath(app.path);
    let files: string[] = [];

    try {
      files = getFilesRecursively(appPath, appPath);
      // Normalize paths to use forward slashes
      files = files.map(path => normalizePath(path));
    } catch (error) {
      logger.error(`Error reading files for app ${appId}:`, error);
    }

    // Get Supabase project name if applicable
    let supabaseProjectName: string | null = null;
    const settings = readSettings();
    if (app.supabaseProjectId && settings.supabase?.accessToken?.value) {
      supabaseProjectName = await getSupabaseProjectName(app.supabaseProjectId);
    }

    // Get Vercel team slug if applicable
    let vercelTeamSlug: string | null = null;
    if (app.vercelTeamId) {
      vercelTeamSlug = await getVercelTeamSlug(app.vercelTeamId);
    }

    res.json({
      ...app,
      files,
      supabaseProjectName,
      vercelTeamSlug
    });
  } catch (error) {
    logger.error('Error getting app:', error);
    res.status(500).json({ error: 'Failed to get app' });
  }
});

// Get app environment variables
router.get('/:appId/env', async (req, res) => {
  try {
    const appId = parseInt(req.params.appId);
    const app = await db.query.apps.findFirst({
      where: eq(apps.id, appId)
    });

    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }

    const appPath = getDyadAppPath(app.path);
    const envFilePath = path.join(appPath, ENV_FILE_NAME);

    // If .env.local doesn't exist, return empty array
    try {
      await fsPromises.access(envFilePath);
    } catch {
      return res.json([]);
    }

    const content = await fsPromises.readFile(envFilePath, 'utf8');
    const envVars = parseEnvFile(content);

    res.json(envVars);
  } catch (error) {
    logger.error('Error getting app environment variables:', error);
    res.status(500).json({ error: 'Failed to get environment variables' });
  }
});

// Set app environment variables
router.put('/:appId/env', async (req, res) => {
  try {
    const appId = parseInt(req.params.appId);
    const { envVars } = req.body;

    const app = await db.query.apps.findFirst({
      where: eq(apps.id, appId)
    });

    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }

    const appPath = getDyadAppPath(app.path);
    const envFilePath = path.join(appPath, ENV_FILE_NAME);

    // Serialize environment variables to .env.local format
    const content = serializeEnvFile(envVars);

    // Write to .env.local file
    await fsPromises.writeFile(envFilePath, content, 'utf8');

    res.json({ success: true });
  } catch (error) {
    logger.error('Error setting app environment variables:', error);
    res.status(500).json({ error: 'Failed to set environment variables' });
  }
});

// List all apps
router.get('/list-apps', async (_req, res) => {
  try {
    const allApps = await db.query.apps.findMany({
      orderBy: [desc(apps.createdAt)]
    });

    res.json({
      apps: allApps,
      appBasePath: getDyadAppPath('$APP_BASE_PATH')
    });
  } catch (error) {
    logger.error('Error listing apps:', error);
    res.status(500).json({ error: 'Failed to list apps' });
  }
});

// Search apps
router.get('/search/:query', async (req, res) => {
  try {
    const searchQuery = req.params.query;
    const searchResults = await db.query.apps.findMany({
      where: like(apps.name, `%${searchQuery}%`),
      orderBy: [desc(apps.createdAt)]
    });

    const results: AppSearchResult[] = searchResults.map(app => ({
      id: app.id,
      name: app.name,
      createdAt: app.createdAt,
      matchedChatTitle: null,
      matchedChatMessage: null
    }));

    res.json({ results });
  } catch (error) {
    logger.error('Error searching apps:', error);
    res.status(500).json({ error: 'Failed to search apps' });
  }
});

// Read app file
router.get('/:appId/files', async (req, res) => {
  try {
    const appId = parseInt(req.params.appId);
    const filePath = req.query.path as string;

    const app = await db.query.apps.findFirst({
      where: eq(apps.id, appId)
    });

    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }

    const appPath = getDyadAppPath(app.path);
    const fullPath = path.join(appPath, filePath);

    // Security check: ensure the path is within the app directory
    if (!fullPath.startsWith(appPath)) {
      return res.status(403).json({ error: 'Invalid file path' });
    }

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const content = await fsPromises.readFile(fullPath, 'utf-8');
    res.json({ content });
  } catch (error) {
    logger.error('Error reading app file:', error);
    res.status(500).json({ error: 'Failed to read app file' });
  }
});

// Edit app file
router.put('/:appId/files', async (req, res) => {
  try {
    const appId = parseInt(req.params.appId);
    const { filePath, content } = req.body;

    const app = await db.query.apps.findFirst({
      where: eq(apps.id, appId)
    });

    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }

    const appPath = getDyadAppPath(app.path);
    const fullPath = path.join(appPath, filePath);

    // Security check: ensure the path is within the app directory
    if (!fullPath.startsWith(appPath)) {
      return res.status(403).json({ error: 'Invalid file path' });
    }

    // Create directories if they don't exist
    const dirPath = path.dirname(fullPath);
    if (!fs.existsSync(dirPath)) {
      await fsPromises.mkdir(dirPath, { recursive: true });
    }

    // Write the file
    await fsPromises.writeFile(fullPath, content, 'utf-8');

    // If file is in a Supabase functions directory, deploy it
    const isSupabaseFunction = isServerFunction(filePath);
    if (isSupabaseFunction && app.supabaseProjectId) {
      // Extract function name from path and read its content
      const functionName = filePath.split('/')[0]; // Get the first segment of the path
      await deploySupabaseFunctions({
        supabaseProjectId: app.supabaseProjectId,
        functionName,
        content
      });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Error editing app file:', error);
    res.status(500).json({ error: 'Failed to edit app file' });
  }
});

// Delete app
router.delete('/:appId', async (req, res) => {
  try {
    const appId = parseInt(req.params.appId);

    // Get app info before deletion
    const app = await db.query.apps.findFirst({
      where: eq(apps.id, appId)
    });

    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }

    // If app is running, stop it first
    const appInfo = runningApps.get(appId);
    if (appInfo) {
      await stopAppByInfo(appId, appInfo);
    }

    // Delete app from database
    await db.delete(apps).where(eq(apps.id, appId));

    // Delete app directory
    const appPath = getDyadAppPath(app.path);
    if (fs.existsSync(appPath)) {
      await fsPromises.rm(appPath, { recursive: true, force: true });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting app:', error);
    res.status(500).json({ error: 'Failed to delete app' });
  }
});

// Rename app
router.put('/:appId/rename', async (req, res) => {
  try {
    const appId = parseInt(req.params.appId);
    const { appName, appPath: newAppPath } = req.body;

    const app = await db.query.apps.findFirst({
      where: eq(apps.id, appId)
    });

    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }

    // Get old and new paths
    const oldPath = getDyadAppPath(app.path);
    const newPath = getDyadAppPath(newAppPath);

    // Check if new path already exists
    if (fs.existsSync(newPath)) {
      return res.status(400).json({ error: 'An app already exists at the new path' });
    }

    // If app is running, stop it first
    const appInfo = runningApps.get(appId);
    if (appInfo) {
      await stopAppByInfo(appId, appInfo);
    }

    // Move directory
    await fsPromises.rename(oldPath, newPath);

    // Update database
    await db.update(apps)
      .set({
        name: appName,
        path: newAppPath
      })
      .where(eq(apps.id, appId));

    res.json({ success: true });
  } catch (error) {
    logger.error('Error renaming app:', error);
    res.status(500).json({ error: 'Failed to rename app' });
  }
});

// Copy app
router.post('/:appId/copy', async (req, res) => {
  try {
    const appId = parseInt(req.params.appId);
    const { newAppName, withHistory } = req.body;

    // Check if new app name already exists
    const existingApp = await db.query.apps.findFirst({
      where: eq(apps.name, newAppName)
    });

    if (existingApp) {
      return res.status(400).json({ error: `An app named "${newAppName}" already exists.` });
    }

    // Get original app
    const originalApp = await db.query.apps.findFirst({
      where: eq(apps.id, appId)
    });

    if (!originalApp) {
      return res.status(404).json({ error: 'Original app not found' });
    }

    const originalAppPath = getDyadAppPath(originalApp.path);
    const newAppPath = getDyadAppPath(newAppName);

    // Copy the app directory
    try {
      await copyDir(originalAppPath, newAppPath, (source: string) => {
        if (!withHistory && path.basename(source) === '.git') {
          return false;
        }
        return true;
      });
    } catch (error) {
      logger.error('Failed to copy app directory:', error);
      throw new Error('Failed to copy app directory.');
    }

    if (!withHistory) {
      // Initialize new git repo and create first commit
      await git.init({
        fs,
        dir: newAppPath,
        defaultBranch: 'main'
      });

      await git.add({
        fs,
        dir: newAppPath,
        filepath: '.'
      });

      await gitCommit({
        path: newAppPath,
        message: 'Init copied app'
      });
    }

    // Create new app entry in database
    const [newApp] = await db
      .insert(apps)
      .values({
        name: newAppName,
        path: newAppName,
        installCommand: originalApp.installCommand,
        startCommand: originalApp.startCommand,
      })
      .returning();

    res.json({ app: newApp });
  } catch (error) {
    logger.error('Error copying app:', error);
    res.status(500).json({ error: 'Failed to copy app' });
  }
});

// Run app
router.post('/:appId/run', async (req, res) => {
  try {
    const appId = parseInt(req.params.appId);

    // Check if app is already running
    if (runningApps.has(appId)) {
      return res.json({ message: 'App is already running' });
    }

    const app = await db.query.apps.findFirst({
      where: eq(apps.id, appId)
    });

    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }

    logger.debug(`Starting app ${appId} in path ${app.path}`);

    const appPath = getDyadAppPath(app.path);

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
      // Clean up any process that might be using our port
      await cleanUpPort(32100);

      await executeApp({
        appPath,
        appId,
        res,
        isNeon: !!app.neonProjectId,
        installCommand: app.installCommand,
        startCommand: app.startCommand
      });
    } catch (error: any) {
      logger.error(`Error running app ${appId}:`, error);
      // Clean up if error happens during setup
      if (runningApps.has(appId) &&
          runningApps.get(appId)?.processId === processCounter.value) {
        runningApps.delete(appId);
      }
      res.write(`event: error\n`);
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  } catch (error) {
    logger.error('Error running app:', error);
    res.status(500).json({ error: 'Failed to run app' });
  }
});

// Stop app
router.post('/:appId/stop', async (req, res) => {
  try {
    const appId = parseInt(req.params.appId);
    logger.log(`Attempting to stop app ${appId}. Current running apps: ${runningApps.size}`);

    const appInfo = runningApps.get(appId);
    if (!appInfo) {
      logger.log(`App ${appId} not found in running apps map. Assuming already stopped.`);
      return res.json({ success: true });
    }

    const { process, processId } = appInfo;
    logger.log(`Found running app ${appId} with processId ${processId} (PID: ${process.pid}). Attempting to stop.`);

    // Check if the process is already exited
    if (process.exitCode !== null || process.signalCode !== null) {
      logger.log(`Process for app ${appId} (PID: ${process.pid}) already exited (code: ${process.exitCode}, signal: ${process.signalCode}). Cleaning up map.`);
      runningApps.delete(appId);
      return res.json({ success: true });
    }

    try {
      await stopAppByInfo(appId, appInfo);
      removeAppIfCurrentProcess(appId, process);
      res.json({ success: true });
    } catch (error: any) {
      logger.error(`Error stopping app ${appId} (PID: ${process.pid}, processId: ${processId}):`, error);
      removeAppIfCurrentProcess(appId, process);
      throw error;
    }
  } catch (error) {
    logger.error('Error stopping app:', error);
    res.status(500).json({ error: 'Failed to stop app' });
  }
});

// Restart app
// Get current branch
router.get('/:appId/branch', async (req, res) => {
  try {
    const appId = parseInt(req.params.appId);
    const app = await db.query.apps.findFirst({
      where: eq(apps.id, appId)
    });

    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }

    const appPath = getDyadAppPath(app.path);

    const branches = await git.listBranches({
      fs,
      dir: appPath
    });

    const currentBranch = await git.currentBranch({
      fs,
      dir: appPath,
      fullname: false
    });

    res.json({
      currentBranch,
      branches
    });
  } catch (error) {
    logger.error('Error getting current branch:', error);
    res.status(500).json({ error: 'Failed to get current branch' });
  }
});

// Reset all
router.post('/reset-all', async (req, res) => {
  try {
    // Delete all files from apps directory
    const appsDir = path.join(getUserDataPath(), 'apps');
    await fsPromises.rm(appsDir, { recursive: true, force: true });
    await fsPromises.mkdir(appsDir);

    // Delete all database entries
    await db.delete(messages);
    await db.delete(chats);
    await db.delete(apps);

    res.json({ success: true });
  } catch (error) {
    logger.error('Error resetting all:', error);
    res.status(500).json({ error: 'Failed to reset all data' });
  }
});

// Get app version
router.get('/version', async (_req, res) => {
  try {
    const version = process.env.npm_package_version || '0.0.0';
    res.json({ version });
  } catch (error) {
    logger.error('Error getting app version:', error);
    res.status(500).json({ error: 'Failed to get app version' });
  }
});

// Add app to favorites
router.post('/:appId/favorite', async (req, res) => {
  try {
    const appId = parseInt(req.params.appId);
    const app = await db.query.apps.findFirst({
      where: eq(apps.id, appId)
    });

    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }

    await db
      .update(apps)
      .set({ isFavorite: true })
      .where(eq(apps.id, appId));

    res.json({ isFavorite: true });
  } catch (error) {
    logger.error('Error adding app to favorites:', error);
    res.status(500).json({ error: 'Failed to add app to favorites' });
  }
});

// List versions (commits) of an app
router.get('/:appId/versions', async (req, res) => {
  try {
    const appId = parseInt(req.params.appId);
    const app = await db.query.apps.findFirst({
      where: eq(apps.id, appId)
    });

    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }

    const appPath = getDyadAppPath(app.path);
    const commits = await git.log({
      fs,
      dir: appPath,
      depth: 50
    });

    const versions = commits.map((commit) => ({
      id: commit.oid,
      message: commit.commit.message,
      date: commit.commit.author.timestamp * 1000,
      author: commit.commit.author.name
    }));

    res.json(versions);
  } catch (error) {
    logger.error('Error listing versions:', error);
    res.status(500).json({ error: 'Failed to list versions' });
  }
});

// Revert to a specific version
router.post('/:appId/versions/:versionId/revert', async (req, res) => {
  try {
    const appId = parseInt(req.params.appId);
    const versionId = req.params.versionId;
    const app = await db.query.apps.findFirst({
      where: eq(apps.id, appId)
    });

    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }

    const appPath = getDyadAppPath(app.path);

    // Create revert commit
    await git.checkout({
      fs,
      dir: appPath,
      ref: versionId
    });

    const changes = await git.statusMatrix({
      fs,
      dir: appPath
    });

    // Only proceed if there are actual changes
    if (changes.length > 0) {
      await git.add({
        fs,
        dir: appPath,
        filepath: '.'
      });

      await gitCommit({
        path: appPath,
        message: `Revert to ${versionId}`
      });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Error reverting version:', error);
    res.status(500).json({ error: 'Failed to revert version' });
  }
});

// Checkout a specific version
router.post('/:appId/versions/:versionId/checkout', async (req, res) => {
  try {
    const appId = parseInt(req.params.appId);
    const versionId = req.params.versionId;
    const app = await db.query.apps.findFirst({
      where: eq(apps.id, appId)
    });

    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }

    const appPath = getDyadAppPath(app.path);

    await git.checkout({
      fs,
      dir: appPath,
      ref: versionId
    });

    res.json({ success: true });
  } catch (error) {
    logger.error('Error checking out version:', error);
    res.status(500).json({ error: 'Failed to checkout version' });
  }
});

// Handle app input responses
router.post('/:appId/input', async (req, res) => {
  try {
    const appId = parseInt(req.params.appId);
    const { input } = req.body;

    const appInfo = runningApps.get(appId);
    if (!appInfo) {
      return res.status(404).json({ error: 'No running app found' });
    }

    appInfo.process.stdin?.write(input + '\n');
    res.json({ success: true });
  } catch (error) {
    logger.error('Error sending input to app:', error);
    res.status(500).json({ error: 'Failed to send input to app' });
  }
});

router.post('/:appId/restart', async (req, res) => {
  try {
    const appId = parseInt(req.params.appId);
    const { removeNodeModules } = req.body;
    logger.log(`Restarting app ${appId}`);

    // First stop the app if it's running
    const appInfo = runningApps.get(appId);
    if (appInfo) {
      const { processId } = appInfo;
      logger.log(`Stopping app ${appId} (processId ${processId}) before restart`);
      await stopAppByInfo(appId, appInfo);
    } else {
      logger.log(`App ${appId} not running. Proceeding to start.`);
    }

    // Clean up any process that might be using our port
    await cleanUpPort(32100);

    const app = await db.query.apps.findFirst({
      where: eq(apps.id, appId)
    });

    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }

    const appPath = getDyadAppPath(app.path);

    // Remove node_modules if requested
    if (removeNodeModules) {
      const nodeModulesPath = path.join(appPath, 'node_modules');
      logger.log(`Removing node_modules for app ${appId} at ${nodeModulesPath}`);
      if (fs.existsSync(nodeModulesPath)) {
        await fsPromises.rm(nodeModulesPath, { recursive: true, force: true });
        logger.log(`Successfully removed node_modules for app ${appId}`);
      } else {
        logger.log(`No node_modules directory found for app ${appId}`);
      }
    }

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Start the app
    logger.debug(`Executing app ${appId} in path ${app.path} after restart request`);
    await executeApp({
      appPath,
      appId,
      res,
      isNeon: !!app.neonProjectId,
      installCommand: app.installCommand,
      startCommand: app.startCommand
    });
  } catch (error) {
    logger.error('Error restarting app:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error restarting app';
    res.write(`event: error\n`);
    res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
    res.end();
  }
});

export default router;