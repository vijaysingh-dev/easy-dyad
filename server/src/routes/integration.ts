import { Router } from 'express';
import logger from '../logger';
import { IS_TEST_BUILD } from '../ipc/utils/test_utils';
import {
  type SaveVercelAccessTokenParams,
  type ConnectToExistingVercelProjectParams,
  type CreateVercelProjectParams,
  type GetVercelDeploymentsParams,
  type DisconnectVercelProjectParams,
  type IsVercelProjectAvailableParams,
  type CreateNeonProjectParams,
  type GetNeonProjectParams,
  type GetNeonProjectResponse,
  type NeonBranch
} from '../ipc/ipc_types';
import { readSettings, writeSettings } from '../../../shared/settings';
import { db } from '../db';
import { apps } from '../db/schema';
import { eq } from 'drizzle-orm';
import { getDyadAppPath } from '../../../shared/lib/paths';
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';
import fs from 'node:fs';
import { getSupabaseClient } from '../ipc/utils/supabase_client';
import { getNeonClient, getNeonErrorMessage, getNeonOrganizationId } from '../neon_admin/neon_management_client';
import { retryOnLocked } from '../ipc/utils/retryOnLocked';

// Use test server URLs when in test mode
const TEST_SERVER_BASE = 'http://localhost:3500';
const VERCEL_API_BASE = IS_TEST_BUILD ? `${TEST_SERVER_BASE}/vercel/api` : 'https://api.vercel.com';

const router = Router();

// GitHub routes
router.get('/github/repos', async (_req, res) => {
  try {
    const settings = readSettings();
    const accessToken = settings.githubAccessToken?.value;
    if (!accessToken) {
      throw new Error("Not authenticated with GitHub.");
    }

    // Fetch user's repositories
    const response = await fetch(
      `https://api.github.com/user/repos?per_page=100&sort=updated`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github+json",
        },
      },
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        `GitHub API error: ${errorData.message || response.statusText}`,
      );
    }

    const repos = await response.json();
    const formattedRepos = repos.map((repo: any) => ({
      name: repo.name,
      full_name: repo.full_name,
      private: repo.private,
    }));

    res.json(formattedRepos);
  } catch (error) {
    logger.error('Error listing GitHub repos:', error);
    res.status(500).json({ error: 'Failed to list GitHub repos' });
  }
});

router.get('/github/repos/:owner/:repo/branches', async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const settings = readSettings();
    const accessToken = settings.githubAccessToken?.value;
    if (!accessToken) {
      throw new Error("Not authenticated with GitHub.");
    }

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/branches`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github+json",
        },
      },
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        `GitHub API error: ${errorData.message || response.statusText}`,
      );
    }

    const branches = await response.json();
    res.json(branches.map((branch: any) => ({
      name: branch.name,
      commit: { sha: branch.commit.sha }
    })));
  } catch (error) {
    logger.error('Error getting GitHub repo branches:', error);
    res.status(500).json({ error: 'Failed to get GitHub repo branches' });
  }
});

router.post('/github/repos/:owner/:repo/connect/:appId', async (req, res) => {
  try {
    const { owner, repo, appId } = req.params;
    const { branch } = req.body;
    const numericAppId = parseInt(appId);

    if (isNaN(numericAppId)) {
      return res.status(400).json({ error: 'Invalid app ID' });
    }

    // Get access token from settings
    const settings = readSettings();
    const accessToken = settings.githubAccessToken?.value;
    if (!accessToken) {
      return res.status(401).json({ error: 'Not authenticated with GitHub' });
    }

    // Verify repo exists and user has access
    const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
      },
    });

    if (!repoResponse.ok) {
      if (repoResponse.status === 404) {
        return res.status(404).json({ error: 'GitHub repository not found' });
      }
      throw new Error(`GitHub API error: ${repoResponse.statusText}`);
    }

    // Get app details
    const app = await db.query.apps.findFirst({
      where: eq(apps.id, numericAppId),
    });

    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }

    // If branch was provided, verify it exists
    if (branch) {
      const branchResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/branches/${branch}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github+json',
          },
        },
      );

      if (!branchResponse.ok) {
        if (branchResponse.status === 404) {
          return res.status(404).json({ error: 'Branch not found' });
        }
        throw new Error(`GitHub API error: ${branchResponse.statusText}`);
      }
    }

    // Update app with GitHub info
    await db
      .update(apps)
      .set({
        githubOrg: owner,
        githubRepo: repo,
        githubBranch: branch || 'main',
      })
      .where(eq(apps.id, numericAppId));

    res.json({ success: true });
  } catch (error) {
    logger.error('Error connecting to GitHub repo:', error);
    res.status(500).json({ error: 'Failed to connect to GitHub repo' });
  }
});

router.post('/github/repos/check-available', async (req, res) => {
  try {
    const { org, repo } = req.body;
    if (!repo) {
      return res.status(400).json({ error: 'Repository name is required' });
    }

    // Get access token from settings
    const settings = readSettings();
    const accessToken = settings.githubAccessToken?.value;
    if (!accessToken) {
      return res.status(401).json({ error: 'Not authenticated with GitHub' });
    }

    // If org is empty, check under the authenticated user
    let owner = org;
    if (!owner) {
      const userRes = await fetch(`https://api.github.com/user`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github+json',
        },
      });

      if (!userRes.ok) {
        throw new Error(`GitHub API error: ${userRes.statusText}`);
      }

      const user = await userRes.json();
      owner = user.login;
    }

    // Check if repo exists
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
      },
    });

    res.json({
      available: response.status === 404,
      error: response.status !== 404 ? 'Repository already exists' : undefined,
    });
  } catch (error) {
    logger.error('Error checking GitHub repo availability:', error);
    res.status(500).json({ error: 'Failed to check GitHub repo availability' });
  }
});

router.post('/github/repos/create', async (req, res) => {
  try {
    const { org, repo, appId, branch } = req.body;

    // Get access token from settings
    const settings = readSettings();
    const accessToken = settings.githubAccessToken?.value;
    if (!accessToken) {
      throw new Error("Not authenticated with GitHub.");
    }

    // If org is empty, create for the authenticated user
    let owner = org;
    if (!owner) {
      const userRes = await fetch(`https://api.github.com/user`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const user = await userRes.json();
      owner = user.login;
    }

    // Create repo
    const createUrl = org
      ? `https://api.github.com/orgs/${owner}/repos`
      : `https://api.github.com/user/repos`;

    const createRes = await fetch(createUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github+json',
      },
      body: JSON.stringify({
        name: repo,
        private: true,
      }),
    });

    if (!createRes.ok) {
      const error = await createRes.json();
      throw new Error(`GitHub API error: ${error.message || createRes.statusText}`);
    }

    // Get app details
    const app = await db.query.apps.findFirst({
      where: eq(apps.id, appId),
    });

    if (!app) {
      throw new Error("App not found");
    }

    // Push app code to GitHub
    const appPath = getDyadAppPath(app.path);

    // Initialize git repo if not already initialized
    if (!fs.existsSync(`${appPath}/.git`)) {
      await git.init({ fs, dir: appPath, defaultBranch: 'main' });
    }

    // Add remote
    await git.addRemote({
      fs,
      dir: appPath,
      remote: 'origin',
      url: `https://github.com/${owner}/${repo}.git`,
    });

    // Push to GitHub
    await git.push({
      fs,
      http,
      dir: appPath,
      remote: 'origin',
      ref: branch || 'main',
      onAuth: () => ({ password: accessToken }),
    });

    // Update app record with GitHub info
    await db
      .update(apps)
      .set({
        githubOrg: owner,
        githubRepo: repo,
        githubBranch: branch || 'main',
      })
      .where(eq(apps.id, appId));

    res.json({ success: true });
  } catch (error) {
    logger.error('Error creating GitHub repo:', error);
    res.status(500).json({ error: 'Failed to create GitHub repo' });
  }
});

router.post('/github/repos/:appId/sync', async (req, res) => {
  try {
    const appId = parseInt(req.params.appId);
    const { force } = req.body;

    if (isNaN(appId)) {
      return res.status(400).json({ error: 'Invalid app ID' });
    }

    // Get access token from settings
    const settings = readSettings();
    const accessToken = settings.githubAccessToken?.value;
    if (!accessToken) {
      return res.status(401).json({ error: 'Not authenticated with GitHub' });
    }

    // Get app details
    const app = await db.query.apps.findFirst({
      where: eq(apps.id, appId),
    });

    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }

    if (!app.githubRepo || !app.githubOrg || !app.githubBranch) {
      return res.status(400).json({ error: 'App is not connected to a GitHub repository' });
    }

    const appPath = getDyadAppPath(app.path);

    // Push to GitHub with force option if specified
    await git.push({
      fs,
      http,
      dir: appPath,
      remote: 'origin',
      ref: app.githubBranch,
      force: !!force,
      onAuth: () => ({ password: accessToken }),
    });

    res.json({ success: true });
  } catch (error: any) {
    logger.error('Error syncing GitHub repo:', error);
    const errorMessage = error.message || 'Failed to sync GitHub repo';
    res.status(500).json({ error: errorMessage });
  }
});

router.delete('/github/repos/:appId/disconnect', async (req, res) => {
  try {
    const appId = parseInt(req.params.appId);

    if (isNaN(appId)) {
      return res.status(400).json({ error: 'Invalid app ID' });
    }

    // Get app details
    const app = await db.query.apps.findFirst({
      where: eq(apps.id, appId),
    });

    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }

    // Update app to remove GitHub info
    await db
      .update(apps)
      .set({
        githubOrg: null,
        githubRepo: null,
        githubBranch: null,
      })
      .where(eq(apps.id, appId));

    // Try to remove the origin remote from the local repo
    try {
      const appPath = getDyadAppPath(app.path);
      await git.deleteRemote({ fs, dir: appPath, remote: 'origin' });
    } catch (error) {
      logger.warn(`Failed to remove GitHub remote for app ${appId}, but continuing:`, error);
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Error disconnecting GitHub repo:', error);
    res.status(500).json({ error: 'Failed to disconnect GitHub repo' });
  }
});

// Vercel routes
router.post('/vercel/token', async (req, res) => {
  try {
    const params: SaveVercelAccessTokenParams = req.body;

    // Save token in settings
    writeSettings({
      vercelAccessToken: {
        value: params.token
      },
    });

    res.json({ success: true });
  } catch (error) {
    logger.error('Error saving Vercel access token:', error);
    res.status(500).json({ error: 'Failed to save Vercel access token' });
  }
});

router.get('/vercel/projects', async (_req, res) => {
  try {
    const settings = readSettings();
    const accessToken = settings.vercelAccessToken?.value;
    if (!accessToken) {
      return res.status(401).json({ error: 'Not authenticated with Vercel' });
    }

    // Using fetch directly since we don't have access to Vercel client
    const response = await fetch(`${VERCEL_API_BASE}/v9/projects`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to list projects: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.projects) {
      throw new Error('Failed to retrieve projects from Vercel');
    }

    res.json(data.projects.map((project: any) => ({
      id: project.id,
      name: project.name,
      framework: project.framework || null,
    })));
  } catch (error) {
    logger.error('Error listing Vercel projects:', error);
    res.status(500).json({ error: 'Failed to list Vercel projects' });
  }
});

router.post('/vercel/projects/available', async (req, res) => {
  try {
    const { name }: IsVercelProjectAvailableParams = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    const settings = readSettings();
    const accessToken = settings.vercelAccessToken?.value;
    if (!accessToken) {
      return res.status(401).json({ error: 'Not authenticated with Vercel' });
    }

    // Search for projects with the given name
    const response = await fetch(`${VERCEL_API_BASE}/v9/projects?name=${encodeURIComponent(name)}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to check project availability: ${response.statusText}`);
    }

    const data = await response.json();
    const projectExists = data.projects?.some((project: any) => project.name === name);

    res.json({
      available: !projectExists,
      error: projectExists ? 'Project name is not available' : undefined,
    });
  } catch (error) {
    logger.error('Error checking Vercel project availability:', error);
    res.status(500).json({ error: 'Failed to check Vercel project availability' });
  }
});

router.post('/vercel/projects/connect', async (req, res) => {
  try {
    const { projectId, appId }: ConnectToExistingVercelProjectParams = req.body;
    if (!projectId || !appId) {
      return res.status(400).json({ error: 'Project ID and app ID are required' });
    }

    // Get project info to verify it exists and get team ID if any
    const settings = readSettings();
    const accessToken = settings.vercelAccessToken?.value;
    if (!accessToken) {
      return res.status(401).json({ error: 'Not authenticated with Vercel' });
    }

    const response = await fetch(`${VERCEL_API_BASE}/v9/projects/${projectId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return res.status(404).json({ error: 'Vercel project not found' });
      }
      throw new Error(`Failed to get project info: ${response.statusText}`);
    }

    const project = await response.json();

    // Update app with Vercel project info
    await db
      .update(apps)
      .set({
        vercelProjectId: projectId,
        vercelTeamId: project.teamId || null,
      })
      .where(eq(apps.id, appId));

    res.json({ success: true });
  } catch (error) {
    logger.error('Error connecting to Vercel project:', error);
    res.status(500).json({ error: 'Failed to connect to Vercel project' });
  }
});

router.post('/vercel/projects/create', async (req, res) => {
  try {
    const { name, appId }: CreateVercelProjectParams = req.body;
    if (!name || !appId) {
      return res.status(400).json({ error: 'Project name and app ID are required' });
    }

    const settings = readSettings();
    const accessToken = settings.vercelAccessToken?.value;
    if (!accessToken) {
      return res.status(401).json({ error: 'Not authenticated with Vercel' });
    }

    // Get app info
    const app = await db.query.apps.findFirst({
      where: eq(apps.id, appId),
    });

    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }

    // Create project
    const response = await fetch(`${VERCEL_API_BASE}/v9/projects`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        framework: 'nextjs', // Default to Next.js
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create project: ${response.statusText}`);
    }

    const project = await response.json();

    // Update app with Vercel project info
    await db
      .update(apps)
      .set({
        vercelProjectId: project.id,
        vercelTeamId: project.teamId || null,
      })
      .where(eq(apps.id, appId));

    res.json({ success: true });
  } catch (error) {
    logger.error('Error creating Vercel project:', error);
    res.status(500).json({ error: 'Failed to create Vercel project' });
  }
});

router.get('/vercel/deployments', async (req, res) => {
  try {
    const appId = parseInt(req.query.appId as string, 10);
    if (isNaN(appId)) {
      return res.status(400).json({ error: 'Invalid app ID' });
    }

    const settings = readSettings();
    const accessToken = settings.vercelAccessToken?.value;
    if (!accessToken) {
      return res.status(401).json({ error: 'Not authenticated with Vercel' });
    }

    // Get app info to get Vercel project ID
    const app = await db.query.apps.findFirst({
      where: eq(apps.id, appId),
    });

    if (!app?.vercelProjectId) {
      return res.status(404).json({ error: 'App is not linked to a Vercel project' });
    }

    // Get deployments
    const response = await fetch(
      `${VERCEL_API_BASE}/v6/deployments?projectId=${app.vercelProjectId}&limit=3`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get deployments: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.deployments) {
      throw new Error('Failed to retrieve deployments from Vercel');
    }

    res.json(data.deployments.map((deployment: any) => ({
      uid: deployment.uid,
      url: deployment.url,
      state: deployment.state || 'unknown',
      createdAt: deployment.createdAt || 0,
      target: deployment.target || 'production',
      readyState: deployment.readyState || 'unknown',
    })));
  } catch (error) {
    logger.error('Error getting Vercel deployments:', error);
    res.status(500).json({ error: 'Failed to get Vercel deployments' });
  }
});

router.post('/vercel/projects/disconnect', async (req, res) => {
  try {
    const { appId }: DisconnectVercelProjectParams = req.body;
    if (!appId) {
      return res.status(400).json({ error: 'App ID is required' });
    }

    // Update app to remove Vercel project info
    await db
      .update(apps)
      .set({
        vercelProjectId: null,
        vercelTeamId: null,
      })
      .where(eq(apps.id, appId));

    res.json({ success: true });
  } catch (error) {
    logger.error('Error disconnecting Vercel project:', error);
    res.status(500).json({ error: 'Failed to disconnect Vercel project' });
  }
});

// Supabase routes
router.get('/supabase/projects', async (_req, res) => {
  try {
    const supabase = await getSupabaseClient();
    const projects = await supabase.getProjects();
    res.json(projects);
  } catch (error) {
    logger.error('Error listing Supabase projects:', error);
    res.status(500).json({ error: 'Failed to list Supabase projects' });
  }
});

router.post('/supabase/projects/:projectId/apps/:appId', async (req, res) => {
  try {
    const { projectId, appId } = req.params;
    const numericAppId = parseInt(appId);

    await db
      .update(apps)
      .set({ supabaseProjectId: projectId })
      .where(eq(apps.id, numericAppId));

    logger.info(`Associated app ${appId} with Supabase project ${projectId}`);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error setting Supabase app project:', error);
    res.status(500).json({ error: 'Failed to set Supabase app project' });
  }
});

router.delete('/supabase/apps/:appId', async (req, res) => {
  try {
    const appId = parseInt(req.params.appId);

    await db
      .update(apps)
      .set({ supabaseProjectId: null })
      .where(eq(apps.id, appId));

    logger.info(`Removed Supabase project association from app ${appId}`);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error unsetting Supabase app project:', error);
    res.status(500).json({ error: 'Failed to unset Supabase app project' });
  }
});

// Neon routes
// This route is implemented below with proper error handling and project creation logic

router.get('/neon/projects/:appId', async (req, res) => {
  try {
    const appId = parseInt(req.params.appId, 10);
    if (isNaN(appId)) {
      return res.status(400).json({ error: 'Invalid app ID format' });
    }

    // Get the app from the database to find the neonProjectId
    const app = await db
      .select()
      .from(apps)
      .where(eq(apps.id, appId))
      .limit(1);

    if (app.length === 0) {
      return res.status(404).json({ error: `App with ID ${appId} not found` });
    }

    const appData = app[0];
    if (!appData.neonProjectId) {
      return res.status(404).json({ error: `No Neon project found for app ${appId}` });
    }

    const neonClient = await getNeonClient();

    // Get project info
    const projectResponse = await neonClient.getProject(appData.neonProjectId);
    if (!projectResponse.data.project) {
      return res.status(500).json({ error: 'Failed to get project: No project data returned' });
    }

    const project = projectResponse.data.project;

    // Get list of branches
    const branchesResponse = await neonClient.listProjectBranches({
      projectId: appData.neonProjectId,
    });

    if (!branchesResponse.data.branches) {
      return res.status(500).json({ error: 'Failed to get branches: No branch data returned' });
    }

    const branches = branchesResponse.data.branches;

    // Map branches to expected format
    const mappedBranches: NeonBranch[] = branches.map(branch => {
      // Find parent branch name if exists
      const parentBranch = branch.parent_id
        ? branches.find(b => b.id === branch.parent_id)
        : undefined;

      let type: NeonBranch['type'] = 'development';
      if (branch.name === 'main') {
        type = 'production';
      } else if (branch.name.startsWith('preview-')) {
        type = 'preview';
      } else if (branch.name.startsWith('snapshot-')) {
        type = 'snapshot';
      }

      return {
        type,
        branchId: branch.id,
        branchName: branch.name,
        lastUpdated: branch.updated_at,
        parentBranchId: branch.parent_id,
        parentBranchName: parentBranch?.name,
      };
    });

    const response: GetNeonProjectResponse = {
      projectId: project.id,
      projectName: project.name,
      orgId: project.org_id ?? "<unknown_org_id>",
      branches: mappedBranches
    };

    res.json(response);
  } catch (error: any) {
    const errorMessage = getNeonErrorMessage(error);
    logger.error('Error getting Neon project:', error);
    res.status(500).json({ error: `Failed to get Neon project: ${errorMessage}` });
  }
});

router.post('/neon/projects', async (req, res) => {
  try {
    const { name, appId } = req.body;
    if (!name || !appId) {
      return res.status(400).json({ error: 'Name and appId are required' });
    }

    const neonClient = await getNeonClient();

    // Get the organization ID
    const orgId = await getNeonOrganizationId();

    // Create project with retry on locked errors
    const response = await retryOnLocked(
      () =>
        neonClient.createProject({
          project: {
            name: name,
            org_id: orgId,
          },
        }),
      `Create project ${name} for app ${appId}`,
    );

    if (!response.data.project) {
      return res.status(500).json({ error: 'Failed to create project: No project data returned' });
    }

    const project = response.data.project;
    const developmentBranch = response.data.branch;

    // Return project info
    // Update app with Neon project ID
    await db
      .update(apps)
      .set({ neonProjectId: project.id })
      .where(eq(apps.id, appId));

    res.json({
      id: project.id,
      name: project.name,
      connectionString: response.data.connection_uris[0].connection_uri,
      branchId: developmentBranch.id,
    });
  } catch (error: any) {
    const errorMessage = getNeonErrorMessage(error);
    logger.error('Error creating Neon project:', error);
    res.status(500).json({ error: `Failed to create Neon project: ${errorMessage}` });
  }
});

router.delete('/neon/projects/:appId', async (req, res) => {
  try {
    const appId = parseInt(req.params.appId, 10);
    if (isNaN(appId)) {
      return res.status(400).json({ error: 'Invalid app ID' });
    }

    // Get the app to check if it has a Neon project
    const app = await db.query.apps.findFirst({
      where: eq(apps.id, appId),
    });

    if (!app) {
      return res.status(404).json({ error: 'App not found' });
    }

    if (!app.neonProjectId) {
      return res.status(400).json({ error: 'App is not connected to a Neon project' });
    }

    // Update app to remove Neon project ID
    await db
      .update(apps)
      .set({ neonProjectId: null })
      .where(eq(apps.id, appId));

    res.json({ success: true });
  } catch (error) {
    logger.error('Error disconnecting Neon project:', error);
    res.status(500).json({ error: 'Failed to disconnect Neon project' });
  }
});

export default router;