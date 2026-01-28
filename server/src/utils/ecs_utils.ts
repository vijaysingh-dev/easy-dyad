import settings from "@/config";
import logger from "@/logger";
import redis from "@/db/redis";
import { Response } from "express";
import util from "util";
import path from "node:path";
import fs, { promises as fsPromises } from "node:fs";
import {
  ECSClient,
  RunTaskCommand,
  DescribeTasksCommand,
  StopTaskCommand,
} from "@aws-sdk/client-ecs";
import {
  CloudWatchLogsClient,
  FilterLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";

import { getCommand, runningApps } from "@/utils/app_utils";
import { safeSend } from "@/utils/safe_sender";
import { withLock } from "@/utils/lock_utils";

const ecs = new ECSClient({ region: settings.AWS_REGION });
const logsClient = new CloudWatchLogsClient({ region: settings.AWS_REGION });

async function streamEcsLogs({
  logGroup,
  logPrefix,
  appId,
  isNeon,
  res,
  onProxyStarted,
}: {
  logGroup: string;
  logPrefix: string;
  appId: string;
  isNeon: boolean;
  res: Response;
  onProxyStarted?: () => void;
}) {
  let nextToken: string | undefined;
  let lastTimestamp = Date.now() - 5000;
  const seenEventIds = new Set<string>();

  while (true) {
    const cmd = new FilterLogEventsCommand({
      logGroupName: logGroup,
      logStreamNamePrefix: logPrefix,
      startTime: lastTimestamp + 1,
      nextToken,
    });

    const out = await logsClient.send(cmd);

    for (const event of out.events ?? []) {
      if (event.eventId && seenEventIds.has(event.eventId)) continue;
      if (event.eventId) seenEventIds.add(event.eventId);

      const message = util.stripVTControlCharacters(event.message ?? "");
      if (event.timestamp && event.timestamp >= lastTimestamp) {
        lastTimestamp = event.timestamp;
      }

      logger.debug(`App (${appId}) ${logPrefix}: ${message}`);

      // Proxy start detection
      if (logPrefix === "proxy") {
        const proxyMatch = message.match(/proxy-server-start url=(.+)/);
        if (proxyMatch) onProxyStarted?.();
      }

      // Drizzle auto-input note
      if (isNeon && message.includes("created or renamed from another")) {
        logger.warn(
          `App ${appId}: drizzle stdin auto-enter skipped (ECS logs are read-only)`,
        );
      }

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

    nextToken = out.nextToken;
    await new Promise((r) => setTimeout(r, 1000));
  }
}

async function waitForTaskEniIp(taskArn: string): Promise<string> {
  const timeoutMs = 60_000;
  const start = Date.now();

  while (true) {
    const describe = await ecs.send(
      new DescribeTasksCommand({
        cluster: settings.ECS_CLUSTER_NAME,
        tasks: [taskArn],
      }),
    );

    const task = describe.tasks?.[0];

    const eniIp = task?.attachments
      ?.find((a) => a.type === "ElasticNetworkInterface")
      ?.details?.find((d) => d.name === "privateIPv4Address")?.value;

    if (eniIp) return eniIp;

    if (Date.now() - start > timeoutMs) {
      throw new Error("Timeout waiting for ECS task ENI IP");
    }

    await new Promise((r) => setTimeout(r, 1500));
  }
}

async function waitForEcsTaskExit(
  taskArn: string,
  appId: string,
  runId: string,
  res: Response,
) {
  while (true) {
    try {
      const d = await ecs.send(
        new DescribeTasksCommand({
          cluster: settings.ECS_CLUSTER_NAME,
          tasks: [taskArn],
        }),
      );

      const task = d.tasks?.[0];
      if (!task) return;

      if (task.lastStatus === "STOPPED") {
        const exitCode =
          task.containers?.find((c) => c.name === settings.APP_CONTAINER_NAME_PREFIX)
            ?.exitCode ?? -1;

        logger.log(`App (${appId}) ECS task exited with status ${exitCode}`);

        const current = runningApps.get(appId);
        if (!current || current.runtime !== "ecs" || current.runId !== runId) {
          logger.log(`Stale ECS watcher ignored for ${appId}`);
          return;
        }

        safeSend(res, "app:exit", {
          appId,
          code: exitCode,
        });

        runningApps.delete(appId);
        redis.del(`app:${appId}`);
        return;
      }

      await new Promise((r) => setTimeout(r, 2000));
    } catch (err: any) {
      logger.error(`Error waiting for ECS task ${taskArn}: ${err.message}`);
      return;
    }
  }
}

export async function executeAppInECS({
  appId,
  res,
  isNeon,
  installCommand,
  startCommand,
}: {
  appId: string;
  res: Response;
  isNeon: boolean;
  installCommand?: string | null;
  startCommand?: string | null;
}): Promise<void> {
  const runId = crypto.randomUUID();

  const run = await ecs.send(
    new RunTaskCommand({
      cluster: settings.ECS_CLUSTER_NAME,
      taskDefinition: settings.ECS_TASK_DEFINITION,
      launchType: "FARGATE",
      count: 1,
      networkConfiguration: {
        awsvpcConfiguration: {
          subnets: settings.ECS_SUBNETS,
          securityGroups: settings.ECS_SECURITY_GROUPS,
          assignPublicIp: "ENABLED",
        },
      },
      overrides: {
        containerOverrides: [
          {
            name: "vite-app",
            command: [
              "sh",
              "-c",
              `cd ${appId} && ${getCommand({ installCommand, startCommand })}`,
            ],
            environment: [
              { name: "HOST", value: settings.APP_HOST },
              { name: "PORT", value: `${settings.APP_PORT}` },
              { name: "HMR_PROTOCOL", value: settings.HMR_PROTOCOL },
              { name: "HMR_HOST", value: `${appId}.${settings.HMR_HOST_SUFIX}` },
              { name: "HMR_PORT", value: `${settings.HMR_PORT}` },
            ],
          },
          {
            name: "easy-proxy",
            environment: [
              { name: "APP_HOST", value: settings.APP_HOST },
              { name: "PROXY_PORT", value: `${settings.PROXY_PORT}` },
              { name: "TARGET_ORIGIN", value: `http://localhost:${settings.APP_PORT}` },
            ],
          },
        ],
      },
    }),
  );

  const taskArn = run.tasks?.[0]?.taskArn;
  if (!taskArn) throw new Error("Failed to start ECS task");
  logger.info(`ECS task started for app ${appId}: ${taskArn}`);

  const eniIp = await waitForTaskEniIp(taskArn);

  runningApps.set(appId, {
    runtime: "ecs",
    runId,
    taskArn,
    eniIp,
  });
  // publish to redis for nginx
  await redis.hset(`app:${appId}`, {
    ip: eniIp,
    preview: settings.APP_PORT,
    sandbox: settings.PROXY_PORT,
  });

  safeSend(res, "app:output", {
    type: "stdout",
    message: `[ecs] task started: ${taskArn}`,
    appId,
  });

  streamEcsLogs({
    logGroup: settings.ECS_LOG_GROUP,
    logPrefix: "vite",
    appId,
    isNeon,
    res,
  });

  streamEcsLogs({
    logGroup: settings.ECS_LOG_GROUP,
    logPrefix: "proxy",
    appId,
    isNeon,
    res,
    onProxyStarted: () => {
      const publicProxyUrl = `https://${appId}.${settings.HMR_HOST_SUFIX}`;
      const originalUrl = `https://${appId}.${settings.APP_HOST_SUFIX}`;

      safeSend(res, "app:output", {
        type: "stdout",
        message: `[easy-proxy-server]started=[${publicProxyUrl}] original=[${originalUrl}]`,
        appId,
      });
    },
  });

  // Lifecycle watcher
  waitForEcsTaskExit(taskArn, appId, runId, res);
}

/**
 * Removes EFS directory used for an app's dependencies.
 * Best-effort: resolves even if directory doesn't exist.
 */
export async function removeEfsPnpmStoreForApp(appId: string): Promise<void> {
  const pnpmPath = path.join("/efs/easy-apps", appId, ".pnpm-store");

  try {
    await fsPromises.rm(pnpmPath, { recursive: true, force: true });
    logger.log(`Removed EFS .pnpm-store for app ${appId} at ${pnpmPath}`);
  } catch (err: any) {
    logger.log(
      `EFS .pnpm-store for app ${appId} already removed or not found (${err?.message})`,
    );
  }
}

export async function stopEcsTask(appId: string): Promise<void> {
  return withLock(appId, async () => {
    const task = runningApps.get(appId);

    if (!task || task.runtime !== "ecs") {
      logger.log(
        `App ${appId} not found in running apps map. Assuming already stopped.`,
      );
      return;
    }

    logger.log(`Stopping ECS task for app ${appId}: ${task.taskArn}`);

    try {
      await ecs.send(
        new StopTaskCommand({
          cluster: settings.ECS_CLUSTER_NAME,
          task: task.taskArn,
          reason: "Stopped by Easy Dyad control plane",
        }),
      );

      runningApps.delete(appId);
      redis.del(`app:${appId}`);
      logger.log(`ECS task for app ${appId} successfully stopped.`);
    } catch (error: any) {
      logger.error(`Error stopping ECS task for app ${appId}:`, error);
      runningApps.delete(appId);
      redis.del(`app:${appId}`);
      throw new Error(`Failed to stop ECS app ${appId}: ${error.message}`);
    }
  });
}
