import settings from "@/config";
import logger from "@/logger";
import db from "@/db";
import { apps } from "@/db/schema";
import { Response } from "express";
import { eq } from "drizzle-orm";
import winston from "winston";
import { platform, arch } from "os";
import path from "node:path";
import fs, { promises as fsPromises } from "node:fs";
import { spawn } from "node:child_process";
import { readSettings } from "@/shared/settings";
import {
  executeAppInDocker,
  removeDockerVolumesForApp,
  stopDockerTask,
} from "@/utils/docker_utils";
import {
  executeAppInECS,
  removeEfsPnpmStoreForApp,
  stopEcsTask,
} from "@/utils/ecs_utils";
import { gitAddAll, gitCommit } from "@/utils/git_utils";
import { simpleSpawn } from "@/utils/simpleSpawn";
import { runShellCommand } from "@/utils/runShellCommand";
import { LargeLanguageModel } from "@/shared/schemas";
import { SERVER_ROOT } from "@/paths";

export async function copyDir(
  source: string,
  destination: string,
  filter?: (source: string) => boolean,
) {
  await fsPromises.cp(source, destination, {
    recursive: true,
    filter: (src: string) => {
      if (path.basename(src) === "node_modules") {
        return false;
      }
      if (filter) {
        return filter(src);
      }
      return true;
    },
  });
}

export function getAppVersion(): string {
  // Read version from package.json at project root
  const packageJsonPath = path.resolve(SERVER_ROOT, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
  return packageJson.version;
}

const DEFAULT_COMMAND = `
(pnpm install && pnpm run dev -- --mode development --host ${settings.APP_HOST} --port ${settings.APP_PORT} --strictPort --hmr-protocol ${settings.HMR_PROTOCOL} --hmr-host ${settings.HMR_HOST} --hmr-port ${settings.HMR_PORT})
||
(npm install --legacy-peer-deps && npm run dev -- --mode development --host ${settings.APP_HOST} --port ${settings.APP_PORT} --strictPort --hmr-protocol ${settings.HMR_PROTOCOL} --hmr-host ${settings.HMR_HOST} --hmr-port ${settings.HMR_PORT})
`;

export function getCommand({
  installCommand,
  startCommand,
}: {
  installCommand?: string | null;
  startCommand?: string | null;
}) {
  const hasCustomCommands = !!installCommand?.trim() && !!startCommand?.trim();
  return hasCustomCommands
    ? `${installCommand!.trim()} && ${startCommand!.trim()}`
    : DEFAULT_COMMAND;
}

export async function getApp(appId: string) {
  const app = await db.query.apps.findFirst({
    where: eq(apps.id, appId),
  });
  if (!app) {
    throw new Error(`App with id ${appId} not found`);
  }
  return app;
}

function serializeModelForDebug(model: LargeLanguageModel): string {
  return `${model.provider}:${model.name} | customId: ${model.customModelId}`;
}

// Shared function to get system debug info
export async function getSystemDebugInfo({
  linesOfLogs,
  level,
}: {
  linesOfLogs: number;
  level: "warn" | "info";
}) {
  console.log("Getting system debug info");

  // Get Node.js and pnpm versions
  let nodeVersion: string | null = null;
  let pnpmVersion: string | null = null;
  let nodePath: string | null = null;
  try {
    nodeVersion = await runShellCommand("node --version");
  } catch (err) {
    console.error("Failed to get Node.js version:", err);
  }

  try {
    pnpmVersion = await runShellCommand("pnpm --version");
  } catch (err) {
    console.error("Failed to get pnpm version:", err);
  }

  try {
    if (platform() === "win32") {
      nodePath = await runShellCommand("where.exe node");
    } else {
      nodePath = await runShellCommand("which node");
    }
  } catch (err) {
    console.error("Failed to get node path:", err);
  }

  // Get Eezi version from package.json
  // const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const packageJsonPath = path.resolve(__dirname, "..", "..", "package.json");
  let eeziVersion = "unknown";
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    eeziVersion = packageJson.version;
  } catch (err) {
    console.error("Failed to read package.json:", err);
  }

  // Get telemetry info from settings
  const settings = readSettings();
  const telemetryId = settings.telemetryUserId || "unknown";

  // Get logs from electron-log
  let logs = "";
  try {
    const fileTransport = logger.transports.find(
      (t) => t instanceof winston.transports.File,
    ) as winston.transports.FileTransportInstance;

    const logPath = fileTransport.filename;
    if (fs.existsSync(logPath)) {
      const logContent = fs.readFileSync(logPath, "utf8");

      const logLines = logContent.split("\n").filter((line) => {
        if (level === "info") {
          return true;
        }
        // Example line:
        // [2025-06-09 13:55:05.209] [debug] (runShellCommand) Command "which node" succeeded with code 0: /usr/local/bin/node
        const logLevelRegex = /\[.*?\] \[(\w+)\]/;
        const match = line.match(logLevelRegex);
        if (!match) {
          // Include non-matching lines (like stack traces) when filtering for warnings
          return true;
        }
        const logLevel = match[1];
        if (level === "warn") {
          return logLevel === "warn" || logLevel === "error";
        }
        return true;
      });

      logs = logLines.slice(-linesOfLogs).join("\n");
    }
  } catch (err) {
    console.error("Failed to read log file:", err);
    logs = `Error reading logs: ${err}`;
  }

  return {
    nodeVersion,
    pnpmVersion,
    nodePath,
    telemetryId,
    selectedLanguageModel: serializeModelForDebug(settings.selectedModel) || "unknown",
    telemetryConsent: settings.telemetryConsent || "unknown",
    telemetryUrl: "https://us.i.posthog.com", // Hardcoded from renderer.tsx
    eeziVersion,
    platform: process.platform,
    architecture: arch(),
    logs,
  };
}

// Define a type for the value stored in runningApps
type DockerRuntimeInfo = {
  runtime: "docker";
  runId: string;
  networkName: string;
  appContainerName: string;
  proxyContainerName: string;
};

type EcsRuntimeInfo = {
  runtime: "ecs";
  taskArn: string;
};

export type RunningAppInfo = DockerRuntimeInfo | EcsRuntimeInfo;

// Store running app processes
export const runningApps = new Map<string, RunningAppInfo>();

export async function executeApp({
  appPath,
  appId,
  res,
  isNeon,
  installCommand,
  startCommand,
}: {
  appPath: string;
  appId: string;
  res: Response;
  isNeon: boolean;
  installCommand?: string | null;
  startCommand?: string | null;
}): Promise<void> {
  if (settings.IS_TEST_BUILD) {
    await executeAppInDocker({
      appPath,
      appId,
      res,
      isNeon,
      installCommand,
      startCommand,
    });
  } else {
    await executeAppInECS({
      appPath,
      appId,
      res,
      isNeon,
      installCommand,
      startCommand,
    });
  }
}

export async function removePnpmStoreForApp(appId: string): Promise<void> {
  if (settings.IS_TEST_BUILD) {
    logger.log(
      `Removing Docker volumes ${settings.PNPM_STORE_VOLUME_PREFIX}-${appId}...`,
    );
    try {
      await removeDockerVolumesForApp(appId);
      logger.log(
        `Removed Docker volumes for app ${appId} (${settings.PNPM_STORE_VOLUME_PREFIX}-${appId}).`,
      );
    } catch (e) {
      // Best-effort cleanup; log and continue
      logger.warn(`Failed to remove Docker volumes for app ${appId}. Continuing: ${e}`);
    }
  } else {
    logger.log(`Removing EFS .pnpm-store for app ${appId}...`);
    try {
      await removeEfsPnpmStoreForApp(appId);
      logger.log(`Removed EFS .pnpm-store for app ${appId}.`);
    } catch (e) {
      // Best-effort cleanup; log and continue
      logger.warn(`Failed to remove EFS .pnpm-store for app ${appId}. Continuing: ${e}`);
    }
  }
}

export async function stopRunningApp(appId: string): Promise<void> {
  if (settings.IS_TEST_BUILD) {
    await stopDockerTask(appId);
  } else {
    await stopEcsTask(appId);
  }
}

function isViteApp(appPath: string): boolean {
  const viteConfigPathJs = path.join(appPath, "vite.config.js");
  const viteConfigPathTs = path.join(appPath, "vite.config.ts");

  return fs.existsSync(viteConfigPathTs) || fs.existsSync(viteConfigPathJs);
}

export function isCapacitorInstalled(appPath: string): boolean {
  const capacitorConfigJs = path.join(appPath, "capacitor.config.js");
  const capacitorConfigTs = path.join(appPath, "capacitor.config.ts");
  const capacitorConfigJson = path.join(appPath, "capacitor.config.json");

  return (
    fs.existsSync(capacitorConfigJs) ||
    fs.existsSync(capacitorConfigTs) ||
    fs.existsSync(capacitorConfigJson)
  );
}

export function isComponentTaggerUpgradeNeeded(appPath: string): boolean {
  const viteConfigPathJs = path.join(appPath, "vite.config.js");
  const viteConfigPathTs = path.join(appPath, "vite.config.ts");

  let viteConfigPath;
  if (fs.existsSync(viteConfigPathTs)) {
    viteConfigPath = viteConfigPathTs;
  } else if (fs.existsSync(viteConfigPathJs)) {
    viteConfigPath = viteConfigPathJs;
  } else {
    return false;
  }

  try {
    const viteConfigContent = fs.readFileSync(viteConfigPath, "utf-8");
    return !viteConfigContent.includes("@dyad-sh/react-vite-component-tagger");
  } catch (e) {
    logger.error("Error reading vite config", e);
    return false;
  }
}

export function isCapacitorUpgradeNeeded(appPath: string): boolean {
  // Check if it's a Vite app first
  if (!isViteApp(appPath)) {
    return false;
  }

  // Check if Capacitor is already installed
  const capacitorConfigJs = path.join(appPath, "capacitor.config.js");
  const capacitorConfigTs = path.join(appPath, "capacitor.config.ts");
  const capacitorConfigJson = path.join(appPath, "capacitor.config.json");

  // If any Capacitor config exists, the upgrade is not needed
  if (
    fs.existsSync(capacitorConfigJs) ||
    fs.existsSync(capacitorConfigTs) ||
    fs.existsSync(capacitorConfigJson)
  ) {
    return false;
  }

  return true;
}

export async function applyComponentTagger(appPath: string) {
  const viteConfigPathJs = path.join(appPath, "vite.config.js");
  const viteConfigPathTs = path.join(appPath, "vite.config.ts");

  let viteConfigPath;
  if (fs.existsSync(viteConfigPathTs)) {
    viteConfigPath = viteConfigPathTs;
  } else if (fs.existsSync(viteConfigPathJs)) {
    viteConfigPath = viteConfigPathJs;
  } else {
    throw new Error("Could not find vite.config.js or vite.config.ts");
  }

  let content = await fs.promises.readFile(viteConfigPath, "utf-8");

  // Add import statement if not present
  if (
    !content.includes(
      'import dyadComponentTagger from "@dyad-sh/react-vite-component-tagger";',
    )
  ) {
    // Add it after the last import statement
    const lines = content.split("\n");
    let lastImportIndex = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].startsWith("import ")) {
        lastImportIndex = i;
        break;
      }
    }
    lines.splice(
      lastImportIndex + 1,
      0,
      'import dyadComponentTagger from "@dyad-sh/react-vite-component-tagger";',
    );
    content = lines.join("\n");
  }

  // Add plugin to plugins array
  if (content.includes("plugins: [")) {
    if (!content.includes("dyadComponentTagger()")) {
      content = content.replace("plugins: [", "plugins: [dyadComponentTagger(), ");
    }
  } else {
    throw new Error(
      "Could not find `plugins: [` in vite.config.ts. Manual installation required.",
    );
  }

  await fs.promises.writeFile(viteConfigPath, content);

  // Install the dependency
  await new Promise<void>((resolve, reject) => {
    logger.info("Installing component-tagger dependency");
    const process = spawn(
      "pnpm add -D @dyad-sh/react-vite-component-tagger || npm install --save-dev --legacy-peer-deps @dyad-sh/react-vite-component-tagger",
      {
        cwd: appPath,
        shell: true,
        stdio: "pipe",
      },
    );

    process.stdout?.on("data", (data) => logger.info(data.toString()));
    process.stderr?.on("data", (data) => logger.error(data.toString()));

    process.on("close", (code) => {
      if (code === 0) {
        logger.info("component-tagger dependency installed successfully");
        resolve();
      } else {
        logger.error(`Failed to install dependency, exit code ${code}`);
        reject(new Error("Failed to install dependency"));
      }
    });

    process.on("error", (err) => {
      logger.error("Failed to spawn pnpm", err);
      reject(err);
    });
  });

  // Commit changes
  try {
    logger.info("Staging and committing changes");
    await gitAddAll({ path: appPath });
    await gitCommit({
      path: appPath,
      message: "[eezi] add Eezi component tagger",
    });
    logger.info("Successfully committed changes");
  } catch (err) {
    logger.warn(
      `Failed to commit changes. This may happen if the project is not in a git repository, or if there are no changes to commit.`,
      err,
    );
  }
}

export async function applyCapacitor({
  appName,
  appPath,
}: {
  appName: string;
  appPath: string;
}) {
  // Install Capacitor dependencies
  await simpleSpawn({
    command:
      "pnpm add @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android || npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android --legacy-peer-deps",
    cwd: appPath,
    successMessage: "Capacitor dependencies installed successfully",
    errorPrefix: "Failed to install Capacitor dependencies",
  });

  // Initialize Capacitor
  await simpleSpawn({
    command: `npx cap init "${appName}" "com.example.${appName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")}" --web-dir=dist`,
    cwd: appPath,
    successMessage: "Capacitor initialized successfully",
    errorPrefix: "Failed to initialize Capacitor",
  });

  // Add iOS and Android platforms
  await simpleSpawn({
    command: "npx cap add ios && npx cap add android",
    cwd: appPath,
    successMessage: "iOS and Android platforms added successfully",
    errorPrefix: "Failed to add iOS and Android platforms",
  });

  // Commit changes
  try {
    logger.info("Staging and committing Capacitor changes");
    await gitAddAll({ path: appPath });
    await gitCommit({
      path: appPath,
      message: "[eezi] add Capacitor for mobile app support",
    });
    logger.info("Successfully committed Capacitor changes");
  } catch (err) {
    logger.warn(
      `Failed to commit changes. This may happen if the project is not in a git repository, or if there are no changes to commit.`,
      err,
    );
    throw new Error(
      "Failed to commit Capacitor changes. Please commit them manually. Error: " + err,
    );
  }
}
