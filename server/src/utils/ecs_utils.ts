import settings from "@/config";
import logger from "@/logger";
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

import { runningApps } from "@/utils/app_utils";
import { safeSend } from "@/utils/safe_sender";
import { withLock } from "@/utils/lock_utils";

const ecs = new ECSClient({ region: settings.AWS_REGION });
const logsClient = new CloudWatchLogsClient({ region: settings.AWS_REGION });

async function streamEcsLogs({
  logGroup,
  logPrefix, // e.g. "vite" or "proxy"
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
  onProxyStarted?: (proxyUrl: string) => void;
}) {
  let nextToken: string | undefined;
  let lastTimestamp = Date.now() - 5000;

  while (true) {
    const cmd = new FilterLogEventsCommand({
      logGroupName: logGroup,
      logStreamNamePrefix: logPrefix,
      startTime: lastTimestamp,
      nextToken,
    });

    const out = await logsClient.send(cmd);

    for (const event of out.events ?? []) {
      const message = util.stripVTControlCharacters(event.message ?? "");
      lastTimestamp = event.timestamp ?? lastTimestamp;

      logger.debug(`App ${appId} (${logPrefix}) stdout: ${message}`);

      safeSend(res, "app:output", {
        type: "stdout",
        message,
        appId,
      });

      // Proxy start detection (same regex as Docker)
      if (logPrefix === "proxy") {
        const proxyMatch = message.match(/proxy-server-start url=(.+)/);
        if (proxyMatch) {
          const proxyUrl = proxyMatch[1].trim();
          logger.info(`[proxy] started at ${proxyUrl}`);
          onProxyStarted?.(proxyUrl);
        }
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
      }
    }

    nextToken = out.nextToken;
    await new Promise((r) => setTimeout(r, 1000));
  }
}

async function waitForEcsTaskExit(taskArn: string, appId: string, res: Response) {
  while (true) {
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
        task.containers?.find((c) => c.name === "vite-app")?.exitCode ?? -1;

      logger.log(`App ${appId} (ECS task) exited with status ${exitCode}`);

      safeSend(res, "app:exit", {
        appId,
        code: exitCode,
      });

      runningApps.delete(appId);
      return;
    }

    await new Promise((r) => setTimeout(r, 2000));
  }
}

export async function executeAppInECS({
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
            name: settings.APP_CONTAINER_NAME_PREFIX,
            environment: [
              { name: "APP_ID", value: appId },
              { name: "INSTALL_CMD", value: installCommand ?? "" },
              { name: "START_CMD", value: startCommand ?? "" },
              { name: "APP_HOST", value: settings.APP_HOST },
              { name: "APP_PORT", value: String(settings.APP_PORT) },
            ],
          },
          {
            name: settings.PROXY_CONTAINER_NAME_PREFIX,
            environment: [
              { name: "APP_ID", value: appId },
              {
                name: "TARGET_ORIGIN",
                value: `http://${settings.APP_CONTAINER_NAME_PREFIX}:${settings.APP_PORT}`,
              },
              { name: "PROXY_PORT", value: String(settings.PROXY_PORT) },
            ],
          },
        ],
      },
    }),
  );

  const taskArn = run.tasks?.[0]?.taskArn;
  if (!taskArn) throw new Error("Failed to start ECS task");

  logger.info(`ECS task started for app ${appId}: ${taskArn}`);

  runningApps.set(appId, { runtime: "ecs", taskArn });

  safeSend(res, "app:output", {
    type: "stdout",
    message: `[ecs] task started: ${taskArn}`,
    appId,
  });

  // Vite logs
  streamEcsLogs({
    logGroup: settings.ECS_LOG_GROUP,
    logPrefix: "vite",
    appId,
    isNeon,
    res,
  });

  // Proxy logs + start detection
  streamEcsLogs({
    logGroup: settings.ECS_LOG_GROUP,
    logPrefix: "proxy",
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

  // Lifecycle watcher
  waitForEcsTaskExit(taskArn, appId, res);
}

/**
 * Removes EFS directory used for an app's dependencies.
 * Best-effort: resolves even if directory doesn't exist.
 */
export async function removeEfsPnpmStoreForApp(appId: string): Promise<void> {
  const pnpmPath = path.join("/efs/eezi-apps", appId, ".pnpm-store");

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
          reason: "Stopped by Eezi control plane",
        }),
      );

      runningApps.delete(appId);
      logger.log(`ECS task for app ${appId} successfully stopped.`);
    } catch (error: any) {
      logger.error(`Error stopping ECS task for app ${appId} (${task.taskArn}):`, error);

      runningApps.delete(appId);
      throw new Error(`Failed to stop ECS app ${appId}: ${error.message}`);
    }
  });
}
