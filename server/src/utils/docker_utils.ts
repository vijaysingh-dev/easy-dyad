import settings from "@/config";
import logger from "@/logger";
import { Response } from "express";
import Docker from "dockerode";
import { PassThrough } from "stream";
import util from "util";

import { getCommand, runningApps, stopRunningApp } from "@/utils/app_utils";
import { safeSend } from "@/utils/safe_sender";
import { withLock } from "@/utils/lock_utils";

const docker = new Docker();

async function streamContainerLogs({
  containerName,
  appId,
  isNeon,
  res,
  onProxyStarted,
}: {
  containerName: string;
  appId: string;
  isNeon: boolean;
  res: Response;
  onProxyStarted?: (proxyUrl: string) => void;
}) {
  const container = docker.getContainer(containerName);

  const stream = await container.logs({
    follow: true,
    stdout: true,
    stderr: true,
  });

  const stdout = new PassThrough();
  const stderr = new PassThrough();
  docker.modem.demuxStream(stream, stdout, stderr);

  stdout.on("data", async (data) => {
    const message = util.stripVTControlCharacters(data.toString());
    logger.debug(`App ${appId} (${containerName}) stdout: ${message}`);

    safeSend(res, "app:output", {
      type: "stdout",
      message,
      appId,
    });

    // ===== PROXY START DETECTION (old startProxy equivalent) =====
    // Old worker emitted: "proxy-server-start url=http://...."
    const proxyMatch = message.match(/proxy-server-start url=(.+)/);
    if (proxyMatch) {
      const proxyUrl = proxyMatch[1].trim();
      logger.info(`[proxy] started at ${proxyUrl}`);
      onProxyStarted?.(proxyUrl);
    }
    // ===========================================================

    // Drizzle auto-input (cannot be replicated, logs are read-only)
    if (isNeon && message.includes("created or renamed from another")) {
      logger.warn(
        `App ${appId}: drizzle stdin auto-enter skipped (Docker log stream is read-only)`,
      );
    }

    const inputRequestPattern = /\s*›\s*\([yY]\/[nN]\)\s*$/;
    if (inputRequestPattern.test(message)) {
      safeSend(res, "app:output", {
        type: "input-requested",
        message,
        appId,
      });
    }
  });

  stderr.on("data", (data) => {
    const message = util.stripVTControlCharacters(data.toString());
    logger.error(`App ${appId} (${containerName}) stderr: ${message}`);
    safeSend(res, "app:output", {
      type: "stderr",
      message,
      appId,
    });
  });
}

async function waitForContainerExit(containerName: string, appId: string) {
  const container = docker.getContainer(containerName);
  try {
    const result = await container.wait();
    logger.log(
      `App ${appId} (${containerName}) exited with status ${result.StatusCode}`,
    );
    stopRunningApp(appId);
  } catch (err: any) {
    logger.error(
      `Error waiting for container ${containerName} (app ${appId}): ${err.message}`,
    );
  }
}

export async function executeAppInDocker({
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
}) {
  const networkName = `${settings.NETWORK_NAME_PREFIX}-${appId}`;
  const appContainerName = `${settings.APP_CONTAINER_NAME_PREFIX}-${appId}`;
  const proxyContainerName = `${settings.PROXY_CONTAINER_NAME_PREFIX}-${appId}`;

  // Docker availability check (same as old spawn("docker --version"))
  try {
    await docker.ping();
    logger.info("Docker is available and running");
  } catch {
    throw new Error(
      "Docker is required but not available. Please install Docker Desktop and ensure it's running.",
    );
  }

  // Cleanup previous run (like stop+rm)
  await docker
    .getNetwork(networkName)
    .remove()
    .catch(() => {});
  await docker
    .getContainer(appContainerName)
    .remove({ force: true })
    .catch(() => {});
  await docker
    .getContainer(proxyContainerName)
    .remove({ force: true })
    .catch(() => {});

  // Create isolated network (ECS task equivalent)
  const network = await docker.createNetwork({
    Name: networkName,
    Driver: "bridge",
  });

  // App container
  const appContainer = await docker.createContainer({
    Image: settings.DOCKER_APP_IMAGE,
    name: appContainerName,
    Cmd: ["sh", "-c", getCommand({ installCommand, startCommand })],
    WorkingDir: "/workspace",
    Tty: false,
    HostConfig: {
      NetworkMode: networkName,
      Binds: [
        `${appPath}:/workspace`,
        `${settings.PNPM_STORE_VOLUME_PREFIX}-${appId}:/workspace/.pnpm-store`,
      ],
      PortBindings: {
        [`${settings.APP_PORT}/tcp`]: [{ HostPort: `${settings.APP_PORT}` }],
      },
    },
    ExposedPorts: {
      [`${settings.APP_PORT}/tcp`]: {},
    },
    Env: [
      `HOST=${settings.APP_HOST}`,
      `PORT=${settings.APP_PORT}`,
      "PNPM_STORE_PATH=/workspace/.pnpm-store",
    ],
  });

  try {
    await appContainer.start();
  } catch (err: any) {
    logger.error(`Failed to start app container ${appId}: ${err.message}`);
    throw new Error(`Failed to spawn Docker container for app ${appId}: ${err.message}`);
  }

  // Proxy container
  const proxyContainer = await docker.createContainer({
    Image: settings.DOCKER_PROXY_IMAGE,
    name: proxyContainerName,
    HostConfig: {
      NetworkMode: networkName,
      PortBindings: {
        [`${settings.PROXY_PORT}/tcp`]: [{ HostPort: `${settings.PROXY_PORT}` }],
      },
    },
    ExposedPorts: {
      [`${settings.PROXY_PORT}/tcp`]: {},
    },
    Env: [
      `APP_HOST=${settings.APP_HOST}`,
      `PROXY_PORT=${settings.PROXY_PORT}`,
      `TARGET_ORIGIN=http://${appContainerName}:${settings.APP_PORT}`,
    ],
  });

  try {
    await proxyContainer.start();
  } catch (err: any) {
    logger.error(`Failed to start proxy for app ${appId}: ${err.message}`);
    throw new Error(`Failed to start proxy container: ${err.message}`);
  }

  // Log streaming (stdout / stderr)
  await streamContainerLogs({ containerName: appContainerName, appId, isNeon, res });
  await streamContainerLogs({
    containerName: proxyContainerName,
    appId,
    isNeon,
    res,
    onProxyStarted: (proxyUrl) => {
      const publicProxyUrl = settings.IS_TEST_BUILD
        ? proxyUrl.replace(/https?:\/\/[^:]+:/, "http://localhost:")
        : proxyUrl;

      safeSend(res, "app:output", {
        type: "stdout",
        message: `[eezi-proxy-server]started=[${publicProxyUrl}]`,
        appId,
      });
    },
  });

  // Lifecycle (close / error equivalent)
  waitForContainerExit(appContainerName, appId);
  waitForContainerExit(proxyContainerName, appId);

  // Register running app
  runningApps.set(appId, {
    runtime: "docker",
    networkName,
    appContainerName,
    proxyContainerName,
  });
}

/**
 * Removes Docker named volumes used for an app's dependencies.
 * Best-effort: resolves even if volumes don't exist.
 */
export async function removeDockerVolumesForApp(appId: string): Promise<void> {
  const pnpmVolume = `eezi-pnpm-${appId}`;

  try {
    const volume = docker.getVolume(pnpmVolume);
    await volume.remove({ force: true });
    logger.log(`Removed Docker volume ${pnpmVolume} for app ${appId}`);
  } catch (err: any) {
    logger.log(
      `Docker volume ${pnpmVolume} for app ${appId} not found or already removed (${err?.message})`,
    );
  }
}

export async function stopDockerTask(appId: string): Promise<void> {
  return withLock(appId, async () => {
    const task = runningApps.get(appId);

    if (!task || task.runtime !== "docker") {
      logger.log(
        `App ${appId} not found in running apps map. Assuming already stopped.`,
      );
      return;
    }

    const { appContainerName, proxyContainerName, networkName } = task;
    logger.log(
      `Found running app ${appId} with containers [app=${appContainerName}, proxy=${proxyContainerName}]. Attempting to stop.`,
    );

    try {
      // Stop both containers in parallel (ECS StopTask equivalent)
      logger.log(`Stopping containers for app ${appId}...`);
      await Promise.allSettled([
        docker
          .getContainer(appContainerName)
          .stop()
          .catch(() => {}),
        docker
          .getContainer(proxyContainerName)
          .stop()
          .catch(() => {}),
      ]);

      // Remove containers
      logger.log(`Removing containers for app ${appId}...`);
      await Promise.allSettled([
        docker
          .getContainer(appContainerName)
          .remove({ force: true })
          .catch(() => {}),
        docker
          .getContainer(proxyContainerName)
          .remove({ force: true })
          .catch(() => {}),
      ]);

      // Remove task network
      logger.log(`Removing network ${networkName} for app ${appId}...`);
      await docker
        .getNetwork(networkName)
        .remove()
        .catch(() => {});

      // Finally remove from running map
      runningApps.delete(appId);
      logger.log(`App ${appId} successfully stopped and cleaned up.`);

      return;
    } catch (error: any) {
      logger.error(
        `Error stopping app ${appId} (containers: ${appContainerName}, ${proxyContainerName}):`,
        error,
      );

      // Best-effort cleanup from map even on failure
      runningApps.delete(appId);

      throw new Error(`Failed to stop app ${appId}: ${error.message}`);
    }
  });
}

// function listenToProcess({
//   process: spawnedProcess,
//   appId,
//   isNeon,
//   res,
// }: {
//   process: ChildProcess;
//   appId: string;
//   isNeon: boolean;
//   res: Response;
// }) {
//   // Log output
//   spawnedProcess.stdout?.on("data", async (data) => {
//     const message = util.stripVTControlCharacters(data.toString());
//     logger.debug(`App ${appId} (PID: ${spawnedProcess.pid}) stdout: ${message}`);

//     // This is a hacky heuristic to pick up when drizzle is asking for user
//     // to select from one of a few choices. We automatically pick the first
//     // option because it's usually a good default choice. We guard this with
//     // isNeon because: 1) only Neon apps (for the official Eezi templates) should
//     // get this template and 2) it's safer to do this with Neon apps because
//     // their databases have point in time restore built-in.
//     if (isNeon && message.includes("created or renamed from another")) {
//       spawnedProcess.stdin?.write(`\r\n`);
//       logger.info(
//         `App ${appId} (PID: ${spawnedProcess.pid}) wrote enter to stdin to automatically respond to drizzle push input`,
//       );
//     }

//     // Check if this is an interactive prompt requiring user input
//     const inputRequestPattern = /\s*›\s*\([yY]\/[nN]\)\s*$/;
//     const isInputRequest = inputRequestPattern.test(message);
//     if (isInputRequest) {
//       // Send special input-requested event for interactive prompts
//       safeSend(res, "app:output", {
//         type: "input-requested",
//         message,
//         appId,
//       });
//     } else {
//       // Normal stdout handling
//       safeSend(res, "app:output", {
//         type: "stdout",
//         message,
//         appId,
//       });

//       const urlMatch = message.match(/(https?:\/\/localhost:(\d+)\/?)/);
//       if (urlMatch) {
//         const originalUrl = urlMatch[1];
//         const port = urlMatch[2];
//         const publicUrl = settings.IS_TEST_BUILD
//           ? `http://localhost:${port}`
//           : originalUrl;

//         await startProxy(originalUrl, {
//           onStarted: (proxyUrl) => {
//             const match = proxyUrl.match(/^https?:\/\/[^:]+:(\d+)\/?$/);
//             const publicProxyUrl =
//               settings.IS_TEST_BUILD && match
//                 ? `http://localhost:${match[1]}`
//                 : proxyUrl;
//             safeSend(res, "app:output", {
//               type: "stdout",
//               message: `[eezi-proxy-server]started=[${publicProxyUrl}] original=[${publicUrl}]`,
//               appId,
//             });
//           },
//         });
//       }
//     }
//   });

//   spawnedProcess.stderr?.on("data", (data) => {
//     const message = util.stripVTControlCharacters(data.toString());
//     logger.error(`App ${appId} (PID: ${spawnedProcess.pid}) stderr: ${message}`);
//     safeSend(res, "app:output", {
//       type: "stderr",
//       message,
//       appId,
//     });
//   });

//   // Handle process exit/close
//   spawnedProcess.on("close", (code, signal) => {
//     logger.log(
//       `App ${appId} (PID: ${spawnedProcess.pid}) process closed with code ${code}, signal ${signal}.`,
//     );
//     removeAppIfCurrentProcess(appId, spawnedProcess);
//   });

//   // Handle errors during process lifecycle (e.g., command not found)
//   spawnedProcess.on("error", (err) => {
//     logger.error(
//       `Error in app ${appId} (PID: ${spawnedProcess.pid}) process: ${err.message}`,
//     );
//     removeAppIfCurrentProcess(appId, spawnedProcess);
//     // Note: We don't throw here as the error is asynchronous. The caller got a success response already.
//     // Consider adding ipcRenderer event emission to notify UI of the error.
//   });
// }

// async function executeAppInDocker({
//   appPath,
//   appId,
//   res,
//   isNeon,
//   installCommand,
//   startCommand,
// }: {
//   appPath: string;
//   appId: string;
//   res: Response;
//   isNeon: boolean;
//   installCommand?: string | null;
//   startCommand?: string | null;
// }): Promise<void> {
//   logger.info(`Starting app ${appId} in Docker mode`);
//   const containerName = `eezi-app-${appId}`;

//   // First, check if Docker is available
//   try {
//     await new Promise<void>((resolve, reject) => {
//       const checkDocker = spawn("docker", ["--version"], { stdio: "pipe" });
//       checkDocker.on("close", (code) => {
//         if (code === 0) {
//           resolve();
//         } else {
//           reject(new Error("Docker is not available"));
//         }
//       });
//       checkDocker.on("error", () => {
//         reject(new Error("Docker is not available"));
//       });
//     });
//   } catch {
//     throw new Error(
//       "Docker is required but not available. Please install Docker Desktop and ensure it's running.",
//     );
//   }

//   // Stop and remove any existing container with the same name
//   try {
//     await new Promise<void>((resolve) => {
//       const stopContainer = spawn("docker", ["stop", containerName], {
//         stdio: "pipe",
//       });
//       stopContainer.on("close", () => {
//         const removeContainer = spawn("docker", ["rm", containerName], {
//           stdio: "pipe",
//         });
//         removeContainer.on("close", () => resolve());
//         removeContainer.on("error", () => resolve()); // Container might not exist
//       });
//       stopContainer.on("error", () => resolve()); // Container might not exist
//     });
//   } catch (error: any) {
//     logger.info(`Docker container ${containerName} not found. Ignoring error: ${error}`);
//   }

//   // Create a Dockerfile in the app directory if it doesn't exist
//   const dockerfilePath = path.join(appPath, "Dockerfile.eezi");
//   if (!fs.existsSync(dockerfilePath)) {
//     const dockerfileContent = `FROM node:22-alpine

// # Install pnpm
// RUN npm install -g pnpm
// `;

//     try {
//       await fsPromises.writeFile(dockerfilePath, dockerfileContent, "utf-8");
//     } catch (error: any) {
//       logger.error(`Failed to create Dockerfile for app ${appId}:`, error);
//       throw new Error(`Failed to create Dockerfile: ${error}`);
//     }
//   }

//   // Build the Docker image
//   const buildProcess = spawn(
//     "docker",
//     ["build", "-f", "Dockerfile.eezi", "-t", containerName, "."],
//     {
//       cwd: appPath,
//       stdio: "pipe",
//     },
//   );

//   let buildError = "";
//   buildProcess.stderr?.on("data", (data) => {
//     buildError += data.toString();
//   });

//   await new Promise<void>((resolve, reject) => {
//     buildProcess.on("close", (code) => {
//       if (code === 0) {
//         resolve();
//       } else {
//         reject(new Error(`Docker build failed: ${buildError}`));
//       }
//     });
//     buildProcess.on("error", (err) => {
//       reject(new Error(`Docker build process error: ${err.message}`));
//     });
//   });

//   // Run the Docker container
//   const initArgs = ["run", "--rm", "--name", containerName];
//   const extraArgs = [
//     "-p",
//     `${settings.PROXY_PORT}:${settings.PROXY_PORT}`,
//     "-p",
//     `${settings.APP_PORT}:${settings.APP_PORT}`,
//     "-v",
//     `${appPath}:/workspace`,
//     "-v",
//     `eezi-pnpm-${appId}:/workspace/.pnpm-store`,
//     "-e",
//     "PNPM_STORE_PATH=/workspace/.pnpm-store",
//     "-e",
//     `PORT=${settings.APP_PORT}`,
//   ];
//   if (settings.IS_TEST_BUILD) extraArgs.push("-e", "HOST=0.0.0.0");

//   const process = spawn(
//     "docker",
//     [
//       ...initArgs,
//       ...extraArgs,
//       "-w",
//       "/workspace",
//       containerName,
//       "sh",
//       "-c",
//       getCommand({ installCommand, startCommand }),
//     ],
//     {
//       stdio: "pipe",
//       detached: false,
//     },
//   );

//   // Check if process spawned correctly
//   if (!process.pid) {
//     // Attempt to capture any immediate errors if possible
//     let errorOutput = "";
//     let spawnErr: any = null;
//     process.stderr?.on("data", (data) => (errorOutput += data.toString()));
//     await new Promise<void>((resolve) => {
//       process.once("error", (err) => {
//         spawnErr = err;
//         resolve();
//       });
//     }); // Wait for error event

//     const details = [
//       spawnErr?.message ? `message=${spawnErr.message}` : null,
//       spawnErr?.code ? `code=${spawnErr.code}` : null,
//       spawnErr?.errno ? `errno=${spawnErr.errno}` : null,
//       spawnErr?.syscall ? `syscall=${spawnErr.syscall}` : null,
//       spawnErr?.path ? `path=${spawnErr.path}` : null,
//       spawnErr?.spawnargs ? `spawnargs=${JSON.stringify(spawnErr.spawnargs)}` : null,
//     ]
//       .filter(Boolean)
//       .join(", ");

//     logger.error(
//       `Failed to spawn Docker container for app ${appId}. ${details}\nSTDERR:\n${
//         errorOutput || "(empty)"
//       }`,
//     );

//     throw new Error(
//       `Failed to spawn Docker container for app ${appId}.
// Details: ${details || "n/a"}
// STDERR:
// ${errorOutput || "(empty)"}`,
//     );
//   }

//   // Increment the counter and store the process reference with its ID
//   const currentProcessId = processCounter.increment();
//   runningApps.set(appId, {
//     process,
//     processId: currentProcessId,
//     containerName,
//   });

//   listenToProcess({
//     process,
//     appId,
//     isNeon,
//     res,
//   });
// }
