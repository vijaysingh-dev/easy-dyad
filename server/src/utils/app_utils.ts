import logger from "@/logger";
import db from "@/db";
import { apps } from "@/db/schema";
import { Response } from "express";
import { eq } from "drizzle-orm";
import winston from "winston";
import { platform, arch } from "os";
import util from "util";
import killPort from "kill-port";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs, { promises as fsPromises } from "node:fs";
import { ChildProcess, spawn } from "node:child_process";
import { readSettings } from "@/services/settings";
import {
  runningApps,
  processCounter,
  stopAppByInfo,
  removeAppIfCurrentProcess,
} from "@/utils/process_manager";
import { startProxy } from "@/utils/start_proxy_server";
import { gitAddAll, gitCommit } from "@/utils/git_utils";
import { simpleSpawn } from "@/utils/simpleSpawn";
import { runShellCommand } from "@/utils/runShellCommand";
import { safeSend } from "@/utils/safe_sender";
import { withLock } from "@/utils/lock_utils";
import { Worker } from "worker_threads";
import { LargeLanguageModel } from "@shared/schemas";

export async function copyDir(
  source: string,
  destination: string,
  filter?: (source: string) => boolean
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
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const packageJsonPath = path.resolve(__dirname, "..", "..", "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
  return packageJson.version;
}

const DEFAULT_COMMAND =
  "(pnpm install && pnpm run dev --port 32100) || (npm install --legacy-peer-deps && npm run dev -- --port 32100)";

function getCommand({
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

export async function getApp(appId: number) {
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
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
      (t) => t instanceof winston.transports.File
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

export async function cleanUpPort(port: number) {
  const settings = readSettings();
  if (settings.runtimeMode2 === "docker") {
    await stopDockerContainersOnPort(port);
  } else {
    await killProcessOnPort(port);
  }
}

export async function stopRunningApp(appId: number): Promise<void> {
  return withLock(appId, async () => {
    const appInfo = runningApps.get(appId);

    if (!appInfo) {
      logger.log(
        `App ${appId} not found in running apps map. Assuming already stopped.`
      );
      return;
    }

    const { process, processId } = appInfo;
    logger.log(
      `Found running app ${appId} with processId ${processId} (PID: ${process.pid}). Attempting to stop.`
    );

    // Check if the process is already exited or closed
    if (process.exitCode !== null || process.signalCode !== null) {
      logger.log(
        `Process for app ${appId} (PID: ${process.pid}) already exited (code: ${process.exitCode}, signal: ${process.signalCode}). Cleaning up map.`
      );
      runningApps.delete(appId); // Ensure cleanup if somehow missed
      return;
    }

    try {
      await stopAppByInfo(appId, appInfo);

      // Now, safely remove the app from the map *after* confirming closure
      removeAppIfCurrentProcess(appId, process);

      return;
    } catch (error: any) {
      logger.error(
        `Error stopping app ${appId} (PID: ${process.pid}, processId: ${processId}):`,
        error
      );
      // Attempt cleanup even if an error occurred during the stop process
      removeAppIfCurrentProcess(appId, process);
      throw new Error(`Failed to stop app ${appId}: ${error.message}`);
    }
  });
}

let proxyWorker: Worker | null = null;

export async function executeApp({
  appPath,
  appId,
  res,
  isNeon,
  installCommand,
  startCommand,
}: {
  appPath: string;
  appId: number;
  res: Response;
  isNeon: boolean;
  installCommand?: string | null;
  startCommand?: string | null;
}): Promise<void> {
  if (proxyWorker) {
    proxyWorker.terminate();
    proxyWorker = null;
  }
  const settings = readSettings();
  const runtimeMode = settings.runtimeMode2 ?? "host";

  if (runtimeMode === "docker") {
    await executeAppInDocker({
      appPath,
      appId,
      res,
      isNeon,
      installCommand,
      startCommand,
    });
  } else {
    await executeAppLocalNode({
      appPath,
      appId,
      res,
      isNeon,
      installCommand,
      startCommand,
    });
  }
}

async function executeAppLocalNode({
  appPath,
  appId,
  res,
  isNeon,
  installCommand,
  startCommand,
}: {
  appPath: string;
  appId: number;
  res: Response;
  isNeon: boolean;
  installCommand?: string | null;
  startCommand?: string | null;
}): Promise<void> {
  const command = getCommand({ installCommand, startCommand });
  const spawnedProcess = spawn(command, [], {
    cwd: appPath,
    shell: true,
    stdio: "pipe", // Ensure stdio is piped so we can capture output/errors and detect close
    detached: false, // Ensure child process is attached to the main process lifecycle unless explicitly backgrounded
  });

  // Check if process spawned correctly
  if (!spawnedProcess.pid) {
    // Attempt to capture any immediate errors if possible
    let errorOutput = "";
    let spawnErr: any | null = null;
    spawnedProcess.stderr?.on("data", (data) => (errorOutput += data.toString()));
    await new Promise<void>((resolve) => {
      spawnedProcess.once("error", (err) => {
        spawnErr = err;
        resolve();
      });
    }); // Wait for error event

    const details = [
      spawnErr?.message ? `message=${spawnErr.message}` : null,
      spawnErr?.code ? `code=${spawnErr.code}` : null,
      spawnErr?.errno ? `errno=${spawnErr.errno}` : null,
      spawnErr?.syscall ? `syscall=${spawnErr.syscall}` : null,
      spawnErr?.path ? `path=${spawnErr.path}` : null,
      spawnErr?.spawnargs ? `spawnargs=${JSON.stringify(spawnErr.spawnargs)}` : null,
    ]
      .filter(Boolean)
      .join(", ");

    logger.error(
      `Failed to spawn process for app ${appId}. Command="${command}", CWD="${appPath}", ${details}\nSTDERR:\n${
        errorOutput || "(empty)"
      }`
    );

    throw new Error(
      `Failed to spawn process for app ${appId}.
Error output:
${errorOutput || "(empty)"}
Details: ${details || "n/a"}
`
    );
  }

  // Increment the counter and store the process reference with its ID
  const currentProcessId = processCounter.increment();
  runningApps.set(appId, {
    process: spawnedProcess,
    processId: currentProcessId,
    isDocker: false,
  });

  listenToProcess({
    process: spawnedProcess,
    appId,
    isNeon,
    res,
  });
}

function listenToProcess({
  process: spawnedProcess,
  appId,
  isNeon,
  res,
}: {
  process: ChildProcess;
  appId: number;
  isNeon: boolean;
  res: Response;
}) {
  // Log output
  spawnedProcess.stdout?.on("data", async (data) => {
    const message = util.stripVTControlCharacters(data.toString());
    logger.debug(`App ${appId} (PID: ${spawnedProcess.pid}) stdout: ${message}`);

    // This is a hacky heuristic to pick up when drizzle is asking for user
    // to select from one of a few choices. We automatically pick the first
    // option because it's usually a good default choice. We guard this with
    // isNeon because: 1) only Neon apps (for the official Eezi templates) should
    // get this template and 2) it's safer to do this with Neon apps because
    // their databases have point in time restore built-in.
    if (isNeon && message.includes("created or renamed from another")) {
      spawnedProcess.stdin?.write(`\r\n`);
      logger.info(
        `App ${appId} (PID: ${spawnedProcess.pid}) wrote enter to stdin to automatically respond to drizzle push input`
      );
    }

    // Check if this is an interactive prompt requiring user input
    const inputRequestPattern = /\s*›\s*\([yY]\/[nN]\)\s*$/;
    const isInputRequest = inputRequestPattern.test(message);
    if (isInputRequest) {
      // Send special input-requested event for interactive prompts
      safeSend(res, "app:output", {
        type: "input-requested",
        message,
        appId,
      });
    } else {
      // Normal stdout handling
      safeSend(res, "app:output", {
        type: "stdout",
        message,
        appId,
      });

      const urlMatch = message.match(/(https?:\/\/localhost:\d+\/?)/);
      if (urlMatch) {
        proxyWorker = await startProxy(urlMatch[1], {
          onStarted: (proxyUrl) => {
            safeSend(res, "app:output", {
              type: "stdout",
              message: `[eezi-proxy-server]started=[${proxyUrl}] original=[${urlMatch[1]}]`,
              appId,
            });
          },
        });
      }
    }
  });

  spawnedProcess.stderr?.on("data", (data) => {
    const message = util.stripVTControlCharacters(data.toString());
    logger.error(`App ${appId} (PID: ${spawnedProcess.pid}) stderr: ${message}`);
    safeSend(res, "app:output", {
      type: "stderr",
      message,
      appId,
    });
  });

  // Handle process exit/close
  spawnedProcess.on("close", (code, signal) => {
    logger.log(
      `App ${appId} (PID: ${spawnedProcess.pid}) process closed with code ${code}, signal ${signal}.`
    );
    removeAppIfCurrentProcess(appId, spawnedProcess);
  });

  // Handle errors during process lifecycle (e.g., command not found)
  spawnedProcess.on("error", (err) => {
    logger.error(
      `Error in app ${appId} (PID: ${spawnedProcess.pid}) process: ${err.message}`
    );
    removeAppIfCurrentProcess(appId, spawnedProcess);
    // Note: We don't throw here as the error is asynchronous. The caller got a success response already.
    // Consider adding ipcRenderer event emission to notify UI of the error.
  });
}

async function executeAppInDocker({
  appPath,
  appId,
  res,
  isNeon,
  installCommand,
  startCommand,
}: {
  appPath: string;
  appId: number;
  res: Response;
  isNeon: boolean;
  installCommand?: string | null;
  startCommand?: string | null;
}): Promise<void> {
  const containerName = `eezi-app-${appId}`;

  // First, check if Docker is available
  try {
    await new Promise<void>((resolve, reject) => {
      const checkDocker = spawn("docker", ["--version"], { stdio: "pipe" });
      checkDocker.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error("Docker is not available"));
        }
      });
      checkDocker.on("error", () => {
        reject(new Error("Docker is not available"));
      });
    });
  } catch {
    throw new Error(
      "Docker is required but not available. Please install Docker Desktop and ensure it's running."
    );
  }

  // Stop and remove any existing container with the same name
  try {
    await new Promise<void>((resolve) => {
      const stopContainer = spawn("docker", ["stop", containerName], {
        stdio: "pipe",
      });
      stopContainer.on("close", () => {
        const removeContainer = spawn("docker", ["rm", containerName], {
          stdio: "pipe",
        });
        removeContainer.on("close", () => resolve());
        removeContainer.on("error", () => resolve()); // Container might not exist
      });
      stopContainer.on("error", () => resolve()); // Container might not exist
    });
  } catch (error: any) {
    logger.info(`Docker container ${containerName} not found. Ignoring error: ${error}`);
  }

  // Create a Dockerfile in the app directory if it doesn't exist
  const dockerfilePath = path.join(appPath, "Dockerfile.eezi");
  if (!fs.existsSync(dockerfilePath)) {
    const dockerfileContent = `FROM node:22-alpine

# Install pnpm
RUN npm install -g pnpm
`;

    try {
      await fsPromises.writeFile(dockerfilePath, dockerfileContent, "utf-8");
    } catch (error: any) {
      logger.error(`Failed to create Dockerfile for app ${appId}:`, error);
      throw new Error(`Failed to create Dockerfile: ${error}`);
    }
  }

  // Build the Docker image
  const buildProcess = spawn(
    "docker",
    ["build", "-f", "Dockerfile.eezi", "-t", `eezi-app-${appId}`, "."],
    {
      cwd: appPath,
      stdio: "pipe",
    }
  );

  let buildError = "";
  buildProcess.stderr?.on("data", (data) => {
    buildError += data.toString();
  });

  await new Promise<void>((resolve, reject) => {
    buildProcess.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Docker build failed: ${buildError}`));
      }
    });
    buildProcess.on("error", (err) => {
      reject(new Error(`Docker build process error: ${err.message}`));
    });
  });

  // Run the Docker container
  const process = spawn(
    "docker",
    [
      "run",
      "--rm",
      "--name",
      containerName,
      "-p",
      "32100:32100",
      "-v",
      `${appPath}:/app`,
      "-v",
      `eezi-pnpm-${appId}:/app/.pnpm-store`,
      "-e",
      "PNPM_STORE_PATH=/app/.pnpm-store",
      "-w",
      "/app",
      `eezi-app-${appId}`,
      "sh",
      "-c",
      getCommand({ installCommand, startCommand }),
    ],
    {
      stdio: "pipe",
      detached: false,
    }
  );

  // Check if process spawned correctly
  if (!process.pid) {
    // Attempt to capture any immediate errors if possible
    let errorOutput = "";
    let spawnErr: any = null;
    process.stderr?.on("data", (data) => (errorOutput += data.toString()));
    await new Promise<void>((resolve) => {
      process.once("error", (err) => {
        spawnErr = err;
        resolve();
      });
    }); // Wait for error event

    const details = [
      spawnErr?.message ? `message=${spawnErr.message}` : null,
      spawnErr?.code ? `code=${spawnErr.code}` : null,
      spawnErr?.errno ? `errno=${spawnErr.errno}` : null,
      spawnErr?.syscall ? `syscall=${spawnErr.syscall}` : null,
      spawnErr?.path ? `path=${spawnErr.path}` : null,
      spawnErr?.spawnargs ? `spawnargs=${JSON.stringify(spawnErr.spawnargs)}` : null,
    ]
      .filter(Boolean)
      .join(", ");

    logger.error(
      `Failed to spawn Docker container for app ${appId}. ${details}\nSTDERR:\n${
        errorOutput || "(empty)"
      }`
    );

    throw new Error(
      `Failed to spawn Docker container for app ${appId}.
Details: ${details || "n/a"}
STDERR:
${errorOutput || "(empty)"}`
    );
  }

  // Increment the counter and store the process reference with its ID
  const currentProcessId = processCounter.increment();
  runningApps.set(appId, {
    process,
    processId: currentProcessId,
    isDocker: true,
    containerName,
  });

  listenToProcess({
    process,
    appId,
    isNeon,
    res,
  });
}

// Helper to kill process on a specific port (cross-platform, using kill-port)
async function killProcessOnPort(port: number): Promise<void> {
  try {
    await killPort(port, "tcp");
  } catch {
    // Ignore if nothing was running on that port
  }
}

// Helper to stop any Docker containers publishing a given host port
async function stopDockerContainersOnPort(port: number): Promise<void> {
  try {
    // List container IDs that publish the given port
    const list = spawn("docker", ["ps", "--filter", `publish=${port}`, "-q"], {
      stdio: "pipe",
    });

    let stdout = "";
    list.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    await new Promise<void>((resolve) => {
      list.on("close", () => resolve());
      list.on("error", () => resolve());
    });

    const containerIds = stdout
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    if (containerIds.length === 0) {
      return;
    }

    // Stop each container best-effort
    await Promise.all(
      containerIds.map(
        (id) =>
          new Promise<void>((resolve) => {
            const stop = spawn("docker", ["stop", id], { stdio: "pipe" });
            stop.on("close", () => resolve());
            stop.on("error", () => resolve());
          })
      )
    );
  } catch (e) {
    logger.warn(`Failed stopping Docker containers on port ${port}: ${e}`);
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
    return !viteConfigContent.includes("@eezi-sh/react-vite-component-tagger");
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
      "import eeziComponentTagger from '@eezi-sh/react-vite-component-tagger';"
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
      "import eeziComponentTagger from '@eezi-sh/react-vite-component-tagger';"
    );
    content = lines.join("\n");
  }

  // Add plugin to plugins array
  if (content.includes("plugins: [")) {
    if (!content.includes("eeziComponentTagger()")) {
      content = content.replace("plugins: [", "plugins: [eeziComponentTagger(), ");
    }
  } else {
    throw new Error(
      "Could not find `plugins: [` in vite.config.ts. Manual installation required."
    );
  }

  await fs.promises.writeFile(viteConfigPath, content);

  // Install the dependency
  await new Promise<void>((resolve, reject) => {
    logger.info("Installing component-tagger dependency");
    const process = spawn(
      "pnpm add -D @eezi-sh/react-vite-component-tagger || npm install --save-dev --legacy-peer-deps @eezi-sh/react-vite-component-tagger",
      {
        cwd: appPath,
        shell: true,
        stdio: "pipe",
      }
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
      err
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
      err
    );
    throw new Error(
      "Failed to commit Capacitor changes. Please commit them manually. Error: " + err
    );
  }
}
