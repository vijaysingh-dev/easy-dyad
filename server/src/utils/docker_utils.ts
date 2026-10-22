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
    logger.debug(`App (${containerName}) stdout: ${message}`);

    // Drizzle auto-input (cannot be replicated, logs are read-only)
    // This is a hacky heuristic to pick up when drizzle is asking for user
    // to select from one of a few choices. We automatically pick the first
    // option because it's usually a good default choice. We guard this with
    // isNeon because: 1) only Neon apps (for the official Easy Dyad templates) should
    // get this template and 2) it's safer to do this with Neon apps because
    // their databases have point in time restore built-in.
    if (isNeon && message.includes("created or renamed from another")) {
      logger.warn(
        `App ${appId}: drizzle stdin auto-enter skipped (Docker log stream is read-only)`,
      );
    }

    // ===== PROXY START DETECTION =====
    const proxyMatch = message.match(/proxy-server-start url=(.+)/);
    if (proxyMatch) {
      const proxyUrl = proxyMatch[1].trim();
      logger.info(`App (${containerName}): [proxy] started at ${proxyUrl}`);
      onProxyStarted?.(proxyUrl);
    } else {
      const inputRequestPattern = /\s*›\s*\([yY]\/[nN]\)\s*$/;
      if (inputRequestPattern.test(message)) {
        safeSend(res, "app:output", {
          type: "input-requested",
          message,
          appId,
        });
      } else {
        safeSend(res, "app:output", {
          type: "stdout",
          message,
          appId,
        });
      }
    }
  });

  stderr.on("data", (data) => {
    const message = util.stripVTControlCharacters(data.toString());
    logger.error(`App (${containerName}) stderr: ${message}`);
    safeSend(res, "app:output", {
      type: "stderr",
      message,
      appId,
    });
  });
}

async function waitForViteReady(containerName: string): Promise<void> {
  const container = docker.getContainer(containerName);
  const stream = await container.logs({ follow: true, stdout: true, stderr: true });

  return new Promise((resolve, reject) => {
    const stdout = new PassThrough();
    docker.modem.demuxStream(stream, stdout, new PassThrough());

    const onData = (data: Buffer) => {
      const msg = data.toString();
      if (msg.includes("VITE") && msg.includes("ready")) {
        stdout.off("data", onData);
        resolve();
      }
    };

    stdout.on("data", onData);
    stream.on("end", () => {
      stdout.off("data", onData);
      reject(new Error("App container exited before Vite was ready"));
    });

    // Includes the app's dependency install, which can take minutes on a cold pnpm store
    setTimeout(() => {
      stdout.off("data", onData);
      reject(new Error("Timeout waiting for Vite readiness"));
    }, 5 * 60_000);
  });
}

async function waitForContainerExit(
  containerName: string,
  appId: string,
  runId: string,
) {
  const container = docker.getContainer(containerName);
  try {
    const result = await container.wait();
    logger.log(`App (${containerName}) exited with status ${result.StatusCode}`);

    const current = runningApps.get(appId);
    if (!current || current.runtime !== "docker" || current.runId !== runId) {
      logger.log(`Stale watcher ignored for ${appId}`);
      return;
    }

    await stopRunningApp(appId);
  } catch (err: any) {
    logger.error(`Error waiting for container ${containerName}: ${err.message}`);
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
    .getContainer(appContainerName)
    .remove({ force: true })
    .catch(() => {});
  await docker
    .getContainer(proxyContainerName)
    .remove({ force: true })
    .catch(() => {});
  await docker
    .getNetwork(networkName)
    .remove()
    .catch(() => {});

  const runId = crypto.randomUUID();

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
    WorkingDir: `/workspace/${appId}`,
    Tty: false,
    HostConfig: {
      NetworkMode: networkName,
      Binds: [
        `${appPath}:/workspace/${appId}`,
        `${settings.PNPM_STORE_VOLUME}:/workspace/.pnpm-store`,
        `${settings.NPM_CACHE_VOLUME}:/workspace/.npm-cache`,
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
      `HMR_PROTOCOL=${settings.HMR_PROTOCOL}`,
      `HMR_HOST=${settings.IS_TEST_BUILD ? "localhost" : `${appId}.${settings.HMR_HOST_SUFIX}`}`,
      `HMR_PORT=${settings.HMR_PORT}`,
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
    await waitForViteReady(appContainerName);
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
        message: `[easy-proxy-server]started=[${publicProxyUrl}] original=[http://localhost:${settings.APP_PORT}]`,
        appId,
      });
    },
  });

  // Lifecycle (close / error equivalent)
  // Only watch app container to avoid lifecycle race
  waitForContainerExit(appContainerName, appId, runId);

  // Register running app
  runningApps.set(appId, {
    runtime: "docker",
    runId,
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
  const pnpmVolume = `easy-pnpm-${appId}`;

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
