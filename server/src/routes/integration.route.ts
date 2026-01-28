import settings from "@/config";
import logger from "@/logger";
import db from "@/db";
import { apps } from "@/db/schema";
import { Router, Response } from "express";
import { EndpointType } from "@neondatabase/api-client";
import { eq } from "drizzle-orm";
import git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import fs from "node:fs";
import {
  getNeonClient,
  getNeonErrorMessage,
  getNeonOrganizationId,
} from "@/services/neon_admin/neon_management_client";
import { readSettings, writeSettings } from "../shared/settings";
import { handleNeonOAuthReturn } from "@/services/neon_admin/neon_return_handler";
import { handleSupabaseOAuthReturn } from "@/services/supabase/supabase_return_handler";
import { getSupabaseClient } from "@/services/supabase/supabase_management_client";
import {
  updateAppGithubRepo,
  validateVercelToken,
  createVercelClient,
  detectFramework,
  getDefaultTeamId,
  updateAppVercelProject,
} from "@/utils/integration_utils";
import { withLock } from "@/utils/lock_utils";
import { retryOnLocked } from "@/utils/retryOnLocked";
import { safeSend } from "@/utils/safe_sender";
import { getEasyAppPath } from "@/paths";
import { NeonBranch } from "@/shared/easyTypes";

const router = Router();

const TEST_SERVER_BASE = "http://localhost:3500";

// --- Deep Link Management ---
router.get("/neon/fake-connect", async (_, res) => {
  try {
    // Call handleNeonOAuthReturn with fake data
    handleNeonOAuthReturn({
      token: "fake-neon-access-token",
      refreshToken: "fake-neon-refresh-token",
      expiresIn: 3600, // 1 hour
    });
    logger.info("Called handleNeonOAuthReturn with fake data during testing.");

    logger.info("Sent fake neon deep-link-received event during testing.");
    res.json({
      type: "neon-oauth-return",
      url: "https://oauth.dyad.sh/api/integrations/neon/login",
    });
  } catch (error: any) {
    logger.error("Error sending fake neon deep-link-received event:", error.message);
    res.status(500).json({ error: "Failed to send fake neon deep-link-received event" });
  }
});

router.post("/supabase/fake-connect-and-set-project", async (req, res) => {
  try {
    const { appId, fakeProjectId } = req.body;
    // Call handleSupabaseOAuthReturn with fake data
    handleSupabaseOAuthReturn({
      token: "fake-access-token",
      refreshToken: "fake-refresh-token",
      expiresIn: 3600, // 1 hour
    });
    logger.info(
      `Called handleSupabaseOAuthReturn with fake data for app ${appId} during testing.`,
    );

    // Set the supabase project for the currently selected app
    await db
      .update(apps)
      .set({
        supabaseProjectId: fakeProjectId,
      })
      .where(eq(apps.id, appId));
    logger.info(
      `Set fake Supabase project ${fakeProjectId} for app ${appId} during testing.`,
    );

    // Simulate the deep link event
    res.json({
      type: "supabase-oauth-return",
      url: "https://supabase-oauth.dyad.sh/api/connect-supabase/login",
    });
  } catch (error: any) {
    logger.error("Error in fake Supabase connect and set project:", error.message);
    res.status(500).json({ error: "Failed to fake connect and set Supabase project" });
  }
});
// --- End Deep Link Management ---

// --- Neon Management ---
router.get("/neon/get-project", async (req, res) => {
  try {
    const appId = req.query.appId as string;
    logger.info(`Getting Neon project info for app ${appId}`);
    // Get the app from the database to find the neonProjectId and neonBranchId
    const app = await db.select().from(apps).where(eq(apps.id, appId)).limit(1);

    if (app.length === 0) {
      throw new Error(`App with ID ${appId} not found`);
    }

    const appData = app[0];
    if (!appData.neonProjectId) {
      throw new Error(`No Neon project found for app ${appId}`);
    }

    const neonClient = await getNeonClient();
    console.log("PROJECT ID", appData.neonProjectId);

    // Get project info
    const projectResponse = await neonClient.getProject(appData.neonProjectId);

    if (!projectResponse.data.project) {
      throw new Error("Failed to get project: No project data returned.");
    }

    const project = projectResponse.data.project;

    // Get list of branches
    const branchesResponse = await neonClient.listProjectBranches({
      projectId: appData.neonProjectId,
    });

    if (!branchesResponse.data.branches) {
      throw new Error("Failed to get branches: No branch data returned.");
    }

    // Map branches to our format
    const branches: NeonBranch[] = branchesResponse.data.branches.map((branch) => {
      let type: "production" | "development" | "snapshot" | "preview";

      if (branch.default) {
        type = "production";
      } else if (branch.id === appData.neonDevelopmentBranchId) {
        type = "development";
      } else if (branch.id === appData.neonPreviewBranchId) {
        type = "preview";
      } else {
        type = "snapshot";
      }

      // Find parent branch name if parent_id exists
      let parentBranchName: string | undefined;
      if (branch.parent_id) {
        const parentBranch = branchesResponse.data.branches?.find(
          (b) => b.id === branch.parent_id,
        );
        parentBranchName = parentBranch?.name;
      }

      return {
        type,
        branchId: branch.id,
        branchName: branch.name,
        lastUpdated: branch.updated_at,
        parentBranchId: branch.parent_id,
        parentBranchName,
      };
    });

    logger.info(`Successfully retrieved Neon project info for app ${appId}`);

    res.json({
      projectId: project.id,
      projectName: project.name,
      orgId: project.org_id ?? "<unknown_org_id>",
      branches,
    });
  } catch (error: any) {
    logger.error(`Failed to get Neon project info:`, error);
    res.status(500).json({ error: "Failed to get Neon project info" });
  }
});

router.post("/neon/create-project", async (req, res) => {
  try {
    const neonClient = await getNeonClient();

    const { name, appId } = req.body;
    logger.info(`Creating Neon project: ${name} for app ${appId}`);

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
      throw new Error("Failed to create project: No project data returned.");
    }

    const project = response.data.project;
    const developmentBranch = response.data.branch;

    const previewBranchResponse = await retryOnLocked(
      () =>
        neonClient.createProjectBranch(project.id, {
          endpoints: [{ type: EndpointType.ReadOnly }],
          branch: {
            name: "preview",
            parent_id: developmentBranch.id,
          },
        }),
      `Create preview branch for project ${project.id}`,
    );

    if (
      !previewBranchResponse.data.branch ||
      !previewBranchResponse.data.connection_uris
    ) {
      throw new Error("Failed to create preview branch: No branch data returned.");
    }

    const previewBranch = previewBranchResponse.data.branch;

    // Store project and branch info in the app's DB row
    await db
      .update(apps)
      .set({
        neonProjectId: project.id,
        neonDevelopmentBranchId: developmentBranch.id,
        neonPreviewBranchId: previewBranch.id,
      })
      .where(eq(apps.id, appId));

    logger.info(
      `Successfully created Neon project: ${project.id} and development branch: ${developmentBranch.id} for app ${appId}`,
    );
    res.json({
      id: project.id,
      name: project.name,
      connectionString: response.data.connection_uris[0].connection_uri,
      branchId: developmentBranch.id,
    });
  } catch (error: any) {
    const errorMessage = getNeonErrorMessage(error);
    logger.error("Error creating Neon project:", errorMessage);
    res.status(500).json({ error: "Failed to create Neon project" });
  }
});
// --- End Neon Management ---

// --- Supabase Management ---
router.get("/supabase/list-projects", async (req, res) => {
  try {
    const supabase = await getSupabaseClient();
    res.json(supabase.getProjects());
  } catch (error: any) {
    logger.error("Error listing Supabase projects:", error);
    res.status(500).json({ error: "Failed to list Supabase projects" });
  }
});

// Set app project - links an Easy Dyad app to a Supabase project
router.post("/supabase/set-app-project", async (req, res) => {
  try {
    const { project, app } = req.body as { project: string; app: string };
    await db.update(apps).set({ supabaseProjectId: project }).where(eq(apps.id, app));
    logger.info(`Associated app ${app} with Supabase project ${project}`);
    res.json({ success: true });
  } catch (error: any) {
    logger.error("Error setting Supabase app project:", error);
    res.status(500).json({ error: "Failed to set Supabase app project" });
  }
});

// Unset app project - removes the link between an Easy Dyad app and a Supabase project
router.post("/supabase/unset-app-project", async (req, res) => {
  try {
    const { app } = req.body as { app: string };
    await db.update(apps).set({ supabaseProjectId: null }).where(eq(apps.id, app));
    logger.info(`Removed Supabase project association for app ${app}`);
    res.json({ success: true });
  } catch (error: any) {
    logger.error("Error unsetting Supabase app project:", error);
    res.status(500).json({ error: "Failed to unset Supabase app project" });
  }
});
// --- End Supabase Management ---

// ----------------------------------------------------------------
// GitHub Repo Management
// ----------------------------------------------------------------
// GitHub Device Flow Constants
// TODO: Fetch this securely, e.g., from environment variables or a config file
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || "Ov23liWV2HdC0RBLecWx";

// Use test server URLs when in test mode
const GITHUB_DEVICE_CODE_URL = settings.IS_TEST_BUILD
  ? `${TEST_SERVER_BASE}/github/login/device/code`
  : "https://github.com/login/device/code";
const GITHUB_ACCESS_TOKEN_URL = settings.IS_TEST_BUILD
  ? `${TEST_SERVER_BASE}/github/login/oauth/access_token`
  : "https://github.com/login/oauth/access_token";
const GITHUB_API_BASE = settings.IS_TEST_BUILD
  ? `${TEST_SERVER_BASE}/github/api`
  : "https://api.github.com";
const GITHUB_GIT_BASE = settings.IS_TEST_BUILD
  ? `${TEST_SERVER_BASE}/github/git`
  : "https://github.com";

const GITHUB_SCOPES = "repo,user,workflow"; // Define the scopes needed

// --- State Management (Simple in-memory, consider alternatives for robustness) ---
interface DeviceFlowState {
  deviceCode: string;
  interval: number;
  timeoutId: NodeJS.Timeout | null;
  isPolling: boolean;
}

// Simple map to track ongoing flows (key could be appId or a unique flow ID if needed)
// For simplicity, let's assume only one flow can happen at a time for now.
const currentFlowState = new Map<number, DeviceFlowState>();

router.get("/github/:appId/start-flow", (req, res) => {
  let heartbeat: NodeJS.Timeout | null = null;
  const appId = parseInt(req.params.appId);
  try {
    // Set up SSE
    const origin = req.headers.origin ?? "*";
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    logger.debug(`Received github:start-flow for appId: ${appId}`);

    // If a flow is already in progress, maybe cancel it or send an error
    const existingFlow = currentFlowState.get(appId);
    if (existingFlow && existingFlow.isPolling) {
      logger.warn("Another GitHub flow is already in progress.");
      safeSend(res, "github:flow-error", {
        appId,
        error: "Another connection process is already active.",
      });
      throw new Error("Another GitHub flow is already in progress.");
    }

    currentFlowState.set(appId, {
      deviceCode: "",
      interval: 5, // Default interval
      timeoutId: null,
      isPolling: false,
    });

    heartbeat = setInterval(() => {
      safeSend(res, "github:ping", {});
    }, 15000);

    req.on("close", () => {
      logger.log(`Client disconnected from github-flow ${appId} run stream.`);
      if (heartbeat) clearInterval(heartbeat);
      currentFlowState.delete(appId);
    });

    safeSend(res, "github:flow-update", {
      appId,
      message: "Requesting device code from GitHub...",
    });

    logger.info("Requesting device code from GitHub:", GITHUB_DEVICE_CODE_URL);
    fetch(GITHUB_DEVICE_CODE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        scope: GITHUB_SCOPES,
      }),
    })
      .then((resp) => {
        if (!resp.ok) {
          return resp.json().then((errData) => {
            throw new Error(
              `GitHub API Error: ${errData.error_description || resp.statusText}`,
            );
          });
        }
        return resp.json();
      })
      .then((data) => {
        logger.info("Received device code response");
        if (!existingFlow) return; // Flow might have been cancelled

        existingFlow.deviceCode = data.device_code;
        existingFlow.interval = data.interval || 5;
        existingFlow.isPolling = true;

        // Send user code and verification URI to renderer
        safeSend(res, "github:flow-update", {
          appId,
          userCode: data.user_code,
          verificationUri: data.verification_uri,
          message: "Please authorize in your browser.",
        });

        // Start polling after the initial interval
        existingFlow.timeoutId = setTimeout(
          () => pollForAccessToken(res, appId),
          existingFlow.interval * 1000,
        );
      })
      .catch((error) => {
        logger.error("Error initiating GitHub device flow:", error);
        safeSend(res, "github:flow-error", {
          appId,
          error: `Failed to start GitHub connection: ${error.message}`,
        });
        stopPolling(appId); // Ensure polling stops on initial error
        currentFlowState.delete(appId); // Clear state on initial error
      });
  } catch (error: any) {
    logger.info("Failed to start github flow");
    safeSend(res, "github:flow-error", {
      appId,
      error: "Error starting github flow",
    });
    if (heartbeat) clearInterval(heartbeat);
    currentFlowState.delete(appId);
  }
});

// --- GitHub List Repos Handler ---
router.get("/github/list-repos", async (req, res) => {
  try {
    // Get access token from settings
    const settings = readSettings();
    const accessToken = settings.githubAccessToken?.value;
    if (!accessToken) {
      throw new Error("Not authenticated with GitHub.");
    }

    // Fetch user's repositories
    const response = await fetch(
      `${GITHUB_API_BASE}/user/repos?per_page=100&sort=updated`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github+json",
        },
      },
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`GitHub API error: ${errorData.message || response.statusText}`);
    }

    const repos = await response.json();
    res.json(
      repos.map((repo: any) => ({
        name: repo.name,
        full_name: repo.full_name,
        private: repo.private,
      })),
    );
  } catch (error: any) {
    logger.error("[GitHub Handler] Failed to list repos:", error);
    res
      .status(500)
      .json({ error: error.message || "Failed to list GitHub repositories." });
  }
});

// --- GitHub Get Repo Branches Handler ---
router.get("/github/get-repo-branches/:owner/:repo", async (req, res) => {
  try {
    const { owner, repo } = req.params;
    // Get access token from settings
    const settings = readSettings();
    const accessToken = settings.githubAccessToken?.value;
    if (!accessToken) {
      throw new Error("Not authenticated with GitHub.");
    }

    // Fetch repository branches
    const response = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/branches`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`GitHub API error: ${errorData.message || response.statusText}`);
    }

    const branches = await response.json();
    res.json(
      branches.map((branch: any) => ({
        name: branch.name,
        commit: { sha: branch.commit.sha },
      })),
    );
  } catch (err: any) {
    logger.error("[GitHub Handler] Failed to get repo branches:", err);
    res.status(500).json({ error: err.message || "Failed to get repository branches." });
  }
});

router.post("/github/rename-branch", async (req, res) => {
  try {
    const { appId, oldBranchName, newBranchName } = req.body;
    const app = await db.query.apps.findFirst({
      where: eq(apps.id, appId),
    });

    if (!app) {
      throw new Error("App not found");
    }

    const appPath = getEasyAppPath(app.path);

    const result = await withLock(appId, async () => {
      try {
        // Check if the old branch exists
        const branches = await git.listBranches({ fs, dir: appPath });
        if (!branches.includes(oldBranchName)) {
          throw new Error(`Branch '${oldBranchName}' not found.`);
        }

        // Check if the new branch name already exists
        if (branches.includes(newBranchName)) {
          // If newBranchName is 'main' and oldBranchName is 'master',
          // and 'main' already exists, we might want to allow this if 'main' is the current branch
          // and just switch to it, or delete 'master'.
          // For now, let's keep it simple and throw an error.
          throw new Error(`Branch '${newBranchName}' already exists. Cannot rename.`);
        }

        await git.renameBranch({
          fs: fs,
          dir: appPath,
          oldref: oldBranchName,
          ref: newBranchName,
        });
        logger.info(
          `Branch renamed from '${oldBranchName}' to '${newBranchName}' for app ${appId}`,
        );
      } catch (error: any) {
        logger.error(`Failed to rename branch for app ${appId}: ${error.message}`);
        throw new Error(
          `Failed to rename branch '${oldBranchName}' to '${newBranchName}': ${error.message}`,
        );
      }
    });
    res.json({ success: true, result });
  } catch (error: any) {
    logger.error("Failed to rename branch:", error);
    res.status(500).json({ error: error.message || "Failed to rename branch." });
  }
});

// --- GitHub Repo Availability Handler ---
router.get("/github/is-repo-available", async (req, res) => {
  try {
    const { org, repo } = req.query as { org: string; repo: string };
    // Get access token from settings
    const settings = readSettings();
    const accessToken = settings.githubAccessToken?.value;
    if (!accessToken) {
      res
        .status(401)
        .json({ available: false, error: "Not authenticated with GitHub." });
      return;
    }
    // If org is empty, use the authenticated user
    const owner =
      org ||
      (await fetch(`${GITHUB_API_BASE}/user`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
        .then((r) => r.json())
        .then((u) => u.login));
    // Check if repo exists
    const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (resp.status === 404) {
      res.json({ available: true });
    } else if (resp.ok) {
      res.status(409).json({ available: false, error: "Repository already exists." });
    } else {
      const data = await resp.json();
      res.status(500).json({ available: false, error: data.message || "Unknown error" });
    }
  } catch (err: any) {
    res.status(500).json({ available: false, error: err.message || "Unknown error" });
  }
});

// --- GitHub Create Repo Handler ---
router.post("/github/create-repo", async (req, res) => {
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
      const userRes = await fetch(`${GITHUB_API_BASE}/user`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const user = await userRes.json();
      owner = user.login;
    }
    // Create repo
    const createUrl = org
      ? `${GITHUB_API_BASE}/orgs/${owner}/repos`
      : `${GITHUB_API_BASE}/user/repos`;
    const resp = await fetch(createUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github+json",
      },
      body: JSON.stringify({
        name: repo,
        private: true,
      }),
    });
    if (!resp.ok) {
      let errorMessage = `Failed to create repository (${resp.status} ${resp.statusText})`;
      try {
        const data = await resp.json();
        logger.error("GitHub API error when creating repo:", {
          status: resp.status,
          statusText: resp.statusText,
          response: data,
        });

        // Handle specific GitHub API error cases
        if (data.message) {
          errorMessage = data.message;
        }

        // Handle validation errors with more details
        if (data.errors && Array.isArray(data.errors)) {
          const errorDetails = data.errors
            .map((err: any) => {
              if (typeof err === "string") return err;
              if (err.message) return err.message;
              if (err.code) return `${err.field || "field"}: ${err.code}`;
              return JSON.stringify(err);
            })
            .join(", ");
          errorMessage = `${
            data.message || "Repository creation failed"
          }: ${errorDetails}`;
        }
      } catch (jsonError) {
        // If response is not JSON, fall back to status text
        logger.error("Failed to parse GitHub API error response:", {
          status: resp.status,
          statusText: resp.statusText,
          jsonError: jsonError instanceof Error ? jsonError.message : String(jsonError),
        });
        errorMessage = `GitHub API error: ${resp.status} ${resp.statusText}`;
      }

      throw new Error(errorMessage);
    }
    // Store org, repo, and branch in the app's DB row (apps table)
    await updateAppGithubRepo({ appId, org: owner, repo, branch });
    res.json({ success: true });
  } catch (error: any) {
    logger.error("[GitHub Handler] Failed to create repo:", error);
    res.status(500).json({ error: error || "Failed to create repository." });
  }
});

// --- GitHub Connect to Existing Repo Handler ---
router.post("/github/connect-existing-repo", async (req, res) => {
  try {
    const { owner, repo, branch, appId } = req.body;
    // Get access token from settings
    const settings = readSettings();
    const accessToken = settings.githubAccessToken?.value;
    if (!accessToken) {
      throw new Error("Not authenticated with GitHub.");
    }

    // Verify the repository exists and user has access
    const repoResponse = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
      },
    });

    if (!repoResponse.ok) {
      const errorData = await repoResponse.json();
      throw new Error(`Repository not found or access denied: ${errorData.message}`);
    }

    // Store org, repo, and branch in the app's DB row
    await updateAppGithubRepo({ appId, org: owner, repo, branch });
    res.json({ success: true });
  } catch (err: any) {
    logger.error("[GitHub Handler] Failed to connect to existing repo:", err);
    res
      .status(500)
      .json({ error: err.message || "Failed to connect to existing repository." });
  }
});

// --- GitHub Push Handler ---
router.post("/github/push", async (req, res) => {
  try {
    const { appId, force } = req.body;
    // Get access token from settings
    const userSettings = readSettings();
    const accessToken = userSettings.githubAccessToken?.value;
    if (!accessToken) {
      return res
        .status(401)
        .json({ success: false, error: "Not authenticated with GitHub." });
    }
    // Get app info from DB
    const app = await db.query.apps.findFirst({ where: eq(apps.id, appId) });
    if (!app || !app.githubOrg || !app.githubRepo) {
      return res
        .status(400)
        .json({ success: false, error: "App is not linked to a GitHub repo." });
    }
    const appPath = getEasyAppPath(app.path);
    const branch = app.githubBranch || "main";

    // Set up remote URL with token
    const remoteUrl = settings.IS_TEST_BUILD
      ? `${GITHUB_GIT_BASE}/${app.githubOrg}/${app.githubRepo}.git`
      : `https://${accessToken}:x-oauth-basic@github.com/${app.githubOrg}/${app.githubRepo}.git`;
    // Set or update remote URL using git config
    await git.setConfig({
      fs,
      dir: appPath,
      path: "remote.origin.url",
      value: remoteUrl,
    });
    // Push to GitHub
    await git.push({
      fs,
      http,
      dir: appPath,
      remote: "origin",
      ref: "main",
      remoteRef: branch,
      onAuth: () => ({
        username: accessToken,
        password: "x-oauth-basic",
      }),
      force: !!force,
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message || "Failed to push to GitHub.",
    });
  }
});

router.post("/github/disconnect", async (req, res) => {
  try {
    const { appId } = req.body;
    logger.log(`Disconnecting GitHub repo for appId: ${appId}`);

    // Get the app from the database
    const app = await db.query.apps.findFirst({
      where: eq(apps.id, appId),
    });

    if (!app) {
      throw new Error("App not found");
    }

    // Update app in database to remove GitHub repo, org, and branch
    await db
      .update(apps)
      .set({
        githubRepo: null,
        githubOrg: null,
        githubBranch: null,
      })
      .where(eq(apps.id, appId));
    res.json({ success: true });
  } catch (error: any) {
    logger.error("Error disconnecting GitHub repo:", error);
    res.status(500).json({ error: "Failed to disconnect GitHub repo" });
  }
});

export async function pollForAccessToken(res: Response, appId: number) {
  const existingFlow = currentFlowState.get(appId);
  if (!existingFlow || !existingFlow.isPolling) {
    logger.debug("[GitHub Handler] Polling stopped or no active flow.");
    return;
  }

  const { deviceCode, interval } = existingFlow;

  logger.debug("[GitHub Handler] Polling for token with device code");
  safeSend(res, "github:flow-update", {
    appId,
    message: "Polling GitHub for authorization...",
  });

  try {
    const response = await fetch(GITHUB_ACCESS_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        device_code: deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    });

    const data = await response.json();

    if (response.ok && data.access_token) {
      logger.log("Successfully obtained GitHub Access Token.");
      safeSend(res, "github:flow-success", {
        appId,
        message: "Successfully connected!",
      });
      writeSettings({
        githubAccessToken: {
          value: data.access_token,
          encryptionType: "aes-256-gcm",
        },
      });

      stopPolling(appId);
      return;
    } else if (data.error) {
      switch (data.error) {
        case "authorization_pending":
          logger.debug("Authorization pending...");
          safeSend(res, "github:flow-update", {
            appId,
            message: "Waiting for user authorization...",
          });
          // Schedule next poll
          existingFlow.timeoutId = setTimeout(
            () => pollForAccessToken(res, appId),
            interval * 1000,
          );
          break;
        case "slow_down":
          const newInterval = interval + 5;
          logger.debug(`Slow down requested. New interval: ${newInterval}s`);
          existingFlow.interval = newInterval; // Update interval
          safeSend(res, "github:flow-update", {
            appId,
            message: `GitHub asked to slow down. Retrying in ${newInterval}s...`,
          });
          existingFlow.timeoutId = setTimeout(
            () => pollForAccessToken(res, appId),
            newInterval * 1000,
          );
          break;
        case "expired_token":
          logger.error("Device code expired.");
          safeSend(res, "github:flow-error", {
            appId,
            error: "Verification code expired. Please try again.",
          });
          stopPolling(appId);
          break;
        case "access_denied":
          logger.error("Access denied by user.");
          safeSend(res, "github:flow-error", {
            appId,
            error: "Authorization denied by user.",
          });
          stopPolling(appId);
          break;
        default:
          logger.error(`Unknown GitHub error: ${data.error_description || data.error}`);
          safeSend(res, "github:flow-error", {
            appId,
            error: `GitHub authorization error: ${data.error_description || data.error}`,
          });
          stopPolling(appId);
          break;
      }
    } else {
      throw new Error(`Unknown response structure: ${JSON.stringify(data)}`);
    }
  } catch (error: any) {
    logger.error("Error polling for GitHub access token:", error);
    safeSend(res, "github:flow-error", {
      appId,
      error: `Network or unexpected error during polling: ${
        error instanceof Error ? error.message : String(error)
      }`,
    });
    stopPolling(appId);
  }
}

export function stopPolling(appId: number) {
  const existingFlow = currentFlowState.get(appId);
  if (existingFlow) {
    if (existingFlow.timeoutId) {
      clearTimeout(existingFlow.timeoutId);
    }
    existingFlow.isPolling = false;
    existingFlow.timeoutId = null;

    logger.debug("[GitHub Handler] Polling stopped.");
  }
}
// --- End GitHub Repo Management ---

// --- Vercel Project Management ---
router.post("/vercel/save-token", async (req, res) => {
  try {
    logger.debug("Saving Vercel access token");
    const { token } = req.body;
    if (!token || token.trim() === "") {
      throw new Error("Access token is required.");
    }

    // Validate the token by making a test API call
    const isValid = await validateVercelToken(token.trim());
    if (!isValid) {
      throw new Error("Invalid access token. Please check your token and try again.");
    }

    writeSettings({
      vercelAccessToken: {
        value: token.trim(),
        encryptionType: "aes-256-gcm",
      },
    });

    logger.log("Successfully saved Vercel access token.");
    res.json({ success: true });
  } catch (error: any) {
    logger.error("Error saving Vercel token:", error);
    res.status(500).json({ error: `Failed to save access token: ${error.message}` });
  }
});

// --- Vercel List Projects Handler ---
router.get("/vercel/list-projects", async (req, res) => {
  try {
    const settings = readSettings();
    const accessToken = settings.vercelAccessToken?.value;
    if (!accessToken) {
      throw new Error("Not authenticated with Vercel.");
    }

    const vercel = createVercelClient(accessToken);
    const response = await vercel.projects.getProjects({});

    if (!response.projects) {
      throw new Error("Failed to retrieve projects from Vercel.");
    }

    res.send(
      response.projects.map((project) => ({
        id: project.id,
        name: project.name,
        framework: project.framework || null,
      })),
    );
  } catch (err: any) {
    logger.error("[Vercel Handler] Failed to list projects:", err);
    res.status(500).json({ error: err.message || "Failed to list Vercel projects." });
  }
});

// --- Vercel Project Availability Handler ---
router.get("/vercel/is-project-available", async (req, res) => {
  try {
    const { name } = req.query as { name: string };
    const settings = readSettings();
    const accessToken = settings.vercelAccessToken?.value;
    if (!accessToken) {
      res.json({ available: false, error: "Not authenticated with Vercel." });
      return;
    }

    const vercel = createVercelClient(accessToken);

    // Check if project name is available by searching for projects with that name
    const response = await vercel.projects.getProjects({
      search: name,
    });

    if (!response.projects) {
      res.json({
        available: false,
        error: "Failed to check project availability.",
      });
      return;
    }

    const projectExists = response.projects.some((project) => project.name === name);

    res.json({
      available: !projectExists,
      error: projectExists ? "Project name is not available." : undefined,
    });
  } catch (err: any) {
    res.json({ available: false, error: err.message || "Unknown error" });
  }
});

// --- Vercel Create Project Handler ---
router.post("/vercel/create-project", async (req, res) => {
  try {
    const { name, appId } = req.body;
    const settings = readSettings();
    const accessToken = settings.vercelAccessToken?.value;
    if (!accessToken) {
      throw new Error("Not authenticated with Vercel.");
    }
    logger.info(`Creating Vercel project: ${name} for app ${appId}`);

    // Get app details to determine the framework
    const app = await db.query.apps.findFirst({ where: eq(apps.id, appId) });
    if (!app) {
      throw new Error("App not found.");
    }

    // Check if app has GitHub repository configured
    if (!app.githubOrg || !app.githubRepo) {
      throw new Error(
        "App must be connected to a GitHub repository before creating a Vercel project.",
      );
    }

    // Detect the framework from the app's directory
    const detectedFramework = await detectFramework(getEasyAppPath(app.path));

    logger.info(
      `Detected framework: ${detectedFramework || "none detected"} for app at ${
        app.path
      }`,
    );

    const vercel = createVercelClient(accessToken);

    const projectData = await vercel.projects.createProject({
      requestBody: {
        name: name,
        gitRepository: {
          type: "github",
          repo: `${app.githubOrg}/${app.githubRepo}`,
        },
        framework: detectedFramework,
      },
    });
    if (!projectData.id) {
      throw new Error("Failed to create project: No project ID returned.");
    }

    // Get the default team ID
    const teamId = await getDefaultTeamId(accessToken);

    const projectDomains = await vercel.projects.getProjectDomains({
      idOrName: projectData.id,
    });
    const projectUrl = "https://" + projectDomains.domains[0].name;

    // Store project info in the app's DB row
    await updateAppVercelProject({
      appId,
      projectId: projectData.id,
      projectName: projectData.name,
      teamId: teamId,
      deploymentUrl: projectUrl,
    });

    logger.info(
      `Successfully created Vercel project: ${projectData.id} with GitHub repo: ${app.githubOrg}/${app.githubRepo}`,
    );

    // Trigger the first deployment
    logger.info(`Triggering first deployment for project: ${projectData.id}`);
    try {
      // Create deployment via Vercel SDK using the project settings we just created
      const deploymentData = await vercel.deployments.createDeployment({
        requestBody: {
          name: projectData.name,
          project: projectData.id,
          target: "prod",
          gitSource: {
            type: "github",
            org: app.githubOrg,
            repo: app.githubRepo,
            ref: app.githubBranch || "main",
          },
        },
      });

      if (deploymentData.url) {
        logger.info(`First deployment successful: ${deploymentData.url}`);
      } else {
        logger.warn("First deployment failed: No deployment URL returned");
      }
    } catch (deployError: any) {
      logger.warn(`First deployment failed with error: ${deployError.message}`);
      // Don't throw here - project creation was successful, deployment failure is non-critical
    }
    res.json({ success: true });
  } catch (err: any) {
    logger.error("Failed to create vercel project:", err);
    res.json({ error: err.message || "Failed to create Vercel project." });
  }
});

// --- Vercel Connect to Existing Project Handler ---
router.post("/vercel/connect-existing-project", async (req, res) => {
  try {
    const { projectId, appId } = req.body;
    const settings = readSettings();
    const accessToken = settings.vercelAccessToken?.value;
    if (!accessToken) {
      throw new Error("Not authenticated with Vercel.");
    }

    logger.info(`Connecting to existing Vercel project: ${projectId} for app ${appId}`);

    const vercel = createVercelClient(accessToken);

    // Verify the project exists and get its details
    const response = await vercel.projects.getProjects({});
    const projectData = response.projects?.find(
      (p) => p.id === projectId || p.name === projectId,
    );

    if (!projectData) {
      throw new Error("Project not found. Please check the project ID.");
    }

    // Get the default team ID
    const teamId = await getDefaultTeamId(accessToken);

    // Store project info in the app's DB row
    await updateAppVercelProject({
      appId,
      projectId: projectData.id,
      projectName: projectData.name,
      teamId: teamId,
      deploymentUrl: projectData.targets?.prod?.url
        ? `https://${projectData.targets.prod.url}`
        : null,
    });

    logger.info(`Successfully connected to Vercel project: ${projectData.id}`);
    res.json({ success: true });
  } catch (err: any) {
    logger.error("Failed to connect to existing vercel project:", err);
    res
      .status(500)
      .json({ error: err.message || "Failed to connect to existing vercel project." });
  }
});

// --- Vercel Get Deployments Handler ---
router.get("/vercel/get-deployments", async (req, res) => {
  try {
    const appId = req.query.appId as string;
    const settings = readSettings();
    const accessToken = settings.vercelAccessToken?.value;
    if (!accessToken) {
      throw new Error("Not authenticated with Vercel.");
    }

    const app = await db.query.apps.findFirst({ where: eq(apps.id, appId) });
    if (!app || !app.vercelProjectId) {
      throw new Error("App is not linked to a Vercel project.");
    }

    logger.info(
      `Getting deployments for Vercel project: ${app.vercelProjectId} for app ${appId}`,
    );

    const vercel = createVercelClient(accessToken);

    // Get deployments for the project
    const deploymentsResponse = await vercel.deployments.getDeployments({
      projectId: app.vercelProjectId,
      limit: 3, // Get last 3 deployments
    });

    if (!deploymentsResponse.deployments) {
      throw new Error("Failed to retrieve deployments from Vercel.");
    }

    // Map deployments to our interface format
    res.send(
      deploymentsResponse.deployments.map((deployment) => ({
        uid: deployment.uid,
        url: deployment.url,
        state: deployment.state || "unknown",
        createdAt: deployment.createdAt || 0,
        target: deployment.target || "prod",
        readyState: deployment.readyState || "unknown",
      })),
    );
  } catch (err: any) {
    logger.error("[Vercel Handler] Failed to get deployments:", err);
    res.status(500).json({ error: err.message || "Failed to get Vercel deployments." });
  }
});

router.post("/vercel/disconnect", async (req, res) => {
  try {
    const { appId } = req.body;

    logger.log(`Disconnecting Vercel project for appId: ${appId}`);

    const app = await db.query.apps.findFirst({
      where: eq(apps.id, appId),
    });

    if (!app) {
      throw new Error("App not found");
    }

    // Update app in database to remove Vercel project info
    await db
      .update(apps)
      .set({
        vercelProjectId: null,
        vercelProjectName: null,
        vercelTeamId: null,
        vercelDeploymentUrl: null,
      })
      .where(eq(apps.id, appId));
    res.json({ success: true });
  } catch (error: any) {
    logger.error("Error disconnecting Vercel project:", error);
    res.status(500).json({ error: "Failed to disconnect Vercel project" });
  }
});
// --- End Vercel Project Management ---

export default router;
