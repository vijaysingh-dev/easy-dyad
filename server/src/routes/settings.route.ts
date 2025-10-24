import logger from "@/logger";
import { Router } from "express";
import { execSync } from "child_process";
import { platform, arch } from "os";
import fixPath from "fix-path";
import { getEnvVar } from "@/utils/read_env";
import { IS_TEST_BUILD } from "@/config";
import { runShellCommand } from "@/utils/runShellCommand";
import { getLanguageModelProviders } from "@/services/llm/language_model_helpers";
import { readSettings, writeSettings } from "@/services/settings";
import { type UserSettings } from "@shared/schemas";
import { UserBudgetInfoSchema } from "@shared/eeziTypes";

const router = Router();

const CONVERSION_RATIO = (10 * 3) / 2;

// This method should try to avoid throwing errors because this is auxiliary
// information and isn't critical to using the app
router.get("/get-user-budget", async (req, res) => {
  if (IS_TEST_BUILD) {
    // Avoid spamming the API in E2E tests.
    res.send(null);
    return;
  }
  logger.info("Attempting to fetch user budget information.");

  const settings = readSettings();

  const apiKey = settings.providerSettings?.auto?.apiKey?.value;

  if (!apiKey) {
    logger.error("LLM Gateway API key (Eezi Pro) is not configured.");
    res.send(null);
    return;
  }

  const url = "https://llm-gateway.dyad.sh/user/info";
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  try {
    // Use native fetch if available, otherwise node-fetch will be used via import
    const response = await fetch(url, {
      method: "GET",
      headers: headers,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error(
        `Failed to fetch user budget. Status: ${response.status}. Body: ${errorBody}`
      );
      res.send(null);
      return;
    }

    const data = await response.json();
    const userInfoData = data["user_info"];
    logger.info("Successfully fetched user budget information.");
    res.send(
      UserBudgetInfoSchema.parse({
        usedCredits: userInfoData["spend"] * CONVERSION_RATIO,
        totalCredits: userInfoData["max_budget"] * CONVERSION_RATIO,
        budgetResetDate: new Date(userInfoData["budget_reset_at"]),
      })
    );
  } catch (error: any) {
    logger.error(`Error fetching user budget: ${error.message}`, error);
    res.status(500).json({ error: "Failed to fetch user budget" });
  }
});

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
    logger.log("nodejs-status for platform:", platform(), "and arch:", arch());
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

export default router;
