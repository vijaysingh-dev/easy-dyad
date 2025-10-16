import { Router } from "express";
import logger from "../logger";
import { type UserSettings, type NodeSystemInfo } from "../ipc/ipc_types";
import { readSettings, writeSettings } from "../../../shared/settings";
import { db } from "../db";
import { apps } from "../db/schema";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { getLanguageModelProviders } from "../shared/language_model_helpers";
import { getEnvVar } from "../utils/read_env";
import { execSync } from "child_process";
import { platform, arch } from "os";
import fixPath from "fix-path";
import { runShellCommand } from "@/utils/runShellCommand";
const execAsync = promisify(exec);
const router = Router();

// Get user settings
router.get("/get-user-settings", async (_req, res) => {
  try {
    const settings = readSettings();
    res.json(settings);
  } catch (error) {
    logger.error("Error getting user settings:", error);
    res.status(500).json({ error: "Failed to get user settings" });
  }
});

// Update user settings
router.patch("/set-user-settings", async (req, res) => {
  try {
    const settings: Partial<UserSettings> = req.body;
    // Update settings file
    writeSettings(settings);
    // Return full updated settings
    res.json(readSettings());
  } catch (error) {
    logger.error("Error updating user settings:", error);
    res.status(500).json({ error: "Failed to update user settings" });
  }
});

// Get environment variables
router.get("/get-env-vars", async (_req, res) => {
  try {
    const envVars: Record<string, string | undefined> = {};
    const providers = await getLanguageModelProviders();
    for (const provider of providers) {
      if (provider.envVarName) {
        envVars[provider.envVarName] = getEnvVar(provider.envVarName);
      }
    }
    res.json(envVars);
  } catch (error) {
    logger.error("Error getting env vars:", error);
    res.status(500).json({ error: "Failed to get env vars" });
  }
});

// Get Node.js system info
router.get("/nodejs-status", async (_req, res) => {
  try {
    logger.log(
      "handling ipc: nodejs-status for platform:",
      platform(),
      "and arch:",
      arch()
    );
    // Run checks in parallel
    const [nodeVersion, pnpmVersion] = await Promise.all([
      runShellCommand("node --version"),
      // First, check if pnpm is installed.
      // If not, try to install it using corepack.
      // If both fail, then pnpm is not available.
      runShellCommand(
        "pnpm --version || (corepack enable pnpm && pnpm --version) || (npm install -g pnpm@latest-10 && pnpm --version)"
      ),
    ]);
    // Default to mac download url.
    let nodeDownloadUrl = "https://nodejs.org/dist/v22.14.0/node-v22.14.0.pkg";
    if (platform() == "win32") {
      if (arch() === "arm64" || arch() === "arm") {
        nodeDownloadUrl = "https://nodejs.org/dist/v22.14.0/node-v22.14.0-arm64.msi";
      } else {
        // x64 is the most common architecture for Windows so it's the
        // default download url.
        nodeDownloadUrl = "https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi";
      }
    }
    res.json({ nodeVersion, pnpmVersion, nodeDownloadUrl });
  } catch (error) {
    logger.error("Error getting Node.js status:", error);
    res.status(500).json({ error: "Failed to get Node.js status" });
  }
});

router.post("/reload-env-path", async (_req, res) => {
  try {
    logger.debug("Reloading env path, previously:", process.env.PATH);
    if (platform() === "win32") {
      const newPath = execSync("cmd /c echo %PATH%", {
        encoding: "utf8",
      }).trim();
      process.env.PATH = newPath;
    } else {
      fixPath();
    }
    logger.debug("Reloaded env path, now:", process.env.PATH);

    res.json({ success: true });
  } catch (error) {
    logger.error("Error reloading env path:", error);
    res.status(500).json({ error: "Failed to reload env path" });
  }
});

// Reset all data
router.post("/reset", async (_req, res) => {
  try {
    // Reset user settings to defaults
    writeSettings({
      selectedModel: undefined,
      selectedChatMode: "ask",
      maxChatTurnsInContext: 10,
      enableAutoFixProblems: false,
      autoApproveChanges: false,
      runtimeMode2: "host",
    });

    // Delete all apps from database
    await db.delete(apps);

    res.json({ success: true });
  } catch (error) {
    logger.error("Error resetting all data:", error);
    res.status(500).json({ error: "Failed to reset all data" });
  }
});

export default router;
