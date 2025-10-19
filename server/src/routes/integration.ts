import db from "@/db";
import log from "@/logger";
import { Router, Response } from "express";
import { IS_TEST_BUILD } from "../ipc/utils/test_utils";
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
  type NeonBranch,
} from "@shared/eeziTypes";
import { readSettings, writeSettings } from "../services/settings";
import { apps } from "../db/schema";
import { eq } from "drizzle-orm";
import git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import fs from "node:fs";
import { getSupabaseClient } from "../ipc/utils/supabase_client";
import {
  getNeonClient,
  getNeonErrorMessage,
  getNeonOrganizationId,
} from "@/services/neon_admin/neon_management_client";
import { handleNeonOAuthReturn } from "@/services/neon_admin/neon_return_handler";
import { handleSupabaseOAuthReturn } from "@/services/supabase/supabase_return_handler";
import { updateAppGithubRepo } from "@/utils/integration_utils";
import { safeSend } from "@/utils/safe_sender";
import { getEeziAppPath } from "@/services/paths";
import { cli } from "winston/lib/winston/config";

const logger = log.scope("integration-route");
const router = Router();

const TEST_SERVER_BASE = "http://localhost:3500";

// --- Deep Link SSE Management ---

const activeClients = new Map<string, Response>();

router.get("/integration/stream/fake-connect", async (req, res) => {
  // Set up SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  try {
    const clientId = crypto.randomUUID();
    // Handle disconnection
    req.on("close", () => {
      console.log(`Client disconnected: ${clientId}`);
      activeClients.delete(clientId);
    });

    activeClients.set(clientId, res);
    safeSend(res, "deep-link:register", { clientId });
  } catch (error) {
    logger.error("Error in fake-connect stream:", error);
    safeSend(res, "deep-link:error", { error: "Internal server error" });
  } finally {
    res.end();
  }
});

router.get("/neon/fake-connect", async (req, res) => {
  try {
    // Call handleNeonOAuthReturn with fake data
    handleNeonOAuthReturn({
      token: "fake-neon-access-token",
      refreshToken: "fake-neon-refresh-token",
      expiresIn: 3600, // 1 hour
    });
    logger.info("Called handleNeonOAuthReturn with fake data during testing.");

    // Simulate the deep link event
    const clientRes = activeClients.get(req.query.clientId as string);
    if (!clientRes) {
      res.status(400).json({ error: "Client not found for deep link simulation" });
      return;
    }
    safeSend(clientRes, "deep-link:received", {
      type: "neon-oauth-return",
      url: "https://oauth.dyad.sh/api/integrations/neon/login",
    });
    logger.info("Sent fake neon deep-link-received event during testing.");
    res.json({ success: true });
  } catch (error) {
    logger.error("Error sending fake neon deep-link-received event:", error);
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
      `Called handleSupabaseOAuthReturn with fake data for app ${appId} during testing.`
    );

    // Set the supabase project for the currently selected app
    await db
      .update(apps)
      .set({
        supabaseProjectId: fakeProjectId,
      })
      .where(eq(apps.id, appId));
    logger.info(
      `Set fake Supabase project ${fakeProjectId} for app ${appId} during testing.`
    );

    // Simulate the deep link event
    const clientRes = activeClients.get(req.query.clientId as string);
    if (!clientRes) {
      res.status(400).json({ error: "Client not found for deep link simulation" });
      return;
    }
    safeSend(clientRes, "deep-link:received", {
      type: "supabase-oauth-return",
      url: "https://supabase-oauth.dyad.sh/api/connect-supabase/login",
    });
    res.json({ success: true });
  } catch (error) {
    logger.error("Error in fake Supabase connect and set project:", error);
    res.status(500).json({ error: "Failed to fake connect and set Supabase project" });
  }
});
// --- End Deep Link SSE Management ---

// --- Neon Management ---
// --- End Neon Management ---

// --- Supabase Management ---

router.get("/supabase/list-projects", async (req, res) => {
  try {
    const supabase = await getSupabaseClient();
    res.json(supabase.getProjects());
  } catch (error) {
    logger.error("Error listing Supabase projects:", error);
    res.status(500).json({ error: "Failed to list Supabase projects" });
  }
});

// Set app project - links a Dyad app to a Supabase project
router.post("/supabase/set-app-project", async (req, res) => {
  try {
    const { project, app } = req.body as { project: string; app: number };
    await db.update(apps).set({ supabaseProjectId: project }).where(eq(apps.id, app));
    logger.info(`Associated app ${app} with Supabase project ${project}`);
    res.json({ success: true });
  } catch (error) {
    logger.error("Error setting Supabase app project:", error);
    res.status(500).json({ error: "Failed to set Supabase app project" });
  }
});

// Unset app project - removes the link between a Dyad app and a Supabase project
router.post("/supabase/unset-app-project", async (req, res) => {
  try {
    const { app } = req.body as { app: number };
    await db.update(apps).set({ supabaseProjectId: null }).where(eq(apps.id, app));
    logger.info(`Removed Supabase project association for app ${app}`);
    res.json({ success: true });
  } catch (error) {
    logger.error("Error unsetting Supabase app project:", error);
    res.status(500).json({ error: "Failed to unset Supabase app project" });
  }
});

// --- End Supabase Management ---

// --- GitHub Repo Management ---

// GitHub Device Flow Constants
// TODO: Fetch this securely, e.g., from environment variables or a config file
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || "Ov23liWV2HdC0RBLecWx";

// Use test server URLs when in test mode
const GITHUB_DEVICE_CODE_URL = IS_TEST_BUILD
  ? `${TEST_SERVER_BASE}/github/login/device/code`
  : "https://github.com/login/device/code";
const GITHUB_ACCESS_TOKEN_URL = IS_TEST_BUILD
  ? `${TEST_SERVER_BASE}/github/login/oauth/access_token`
  : "https://github.com/login/oauth/access_token";
const GITHUB_API_BASE = IS_TEST_BUILD
  ? `${TEST_SERVER_BASE}/github/api`
  : "https://api.github.com";
const GITHUB_GIT_BASE = IS_TEST_BUILD
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

router.post("/github/start-flow/:appId/stream", (req, res) => {
  const appId = parseInt(req.params.appId);
  try {
    // Set up SSE
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
      return;
    }

    currentFlowState.set(appId, {
      deviceCode: "",
      interval: 5, // Default interval
      timeoutId: null,
      isPolling: false,
    });

    safeSend(res, "github:flow-update", {
      appId,
      message: "Requesting device code from GitHub...",
    });

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
      .then((res) => {
        if (!res.ok) {
          return res.json().then((errData) => {
            throw new Error(
              `GitHub API Error: ${errData.error_description || res.statusText}`
            );
          });
        }
        return res.json();
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
          existingFlow.interval * 1000
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
  } catch (error) {
    logger.info("Failed to start github flow");
    safeSend(res, "github:flow-error", {
      appId,
      error: "Error starting github flow",
    });
  } finally {
    res.end();
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
      }
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
      }))
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
      }))
    );
  } catch (err: any) {
    logger.error("[GitHub Handler] Failed to get repo branches:", err);
    res.status(500).json({ error: err.message || "Failed to get repository branches." });
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
          errorMessage = `${data.message || "Repository creation failed"}: ${errorDetails}`;
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
  } catch (error) {
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
    const settings = readSettings();
    const accessToken = settings.githubAccessToken?.value;
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
    const appPath = getEeziAppPath(app.path);
    const branch = app.githubBranch || "main";

    // Set up remote URL with token
    const remoteUrl = IS_TEST_BUILD
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
  } catch (error) {
    logger.error("Error disconnecting GitHub repo:", error);
    res.status(500).json({ error: "Failed to disconnect GitHub repo" });
  }
});

// function event.sender.send(channel: string, data: any) {
//   if (currentFlowState?.window && !currentFlowState.window.isDestroyed()) {
//     currentFlowState.window.webContents.send(channel, data);
//   }
// }

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
            interval * 1000
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
            newInterval * 1000
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
  } catch (error) {
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

export default router;
