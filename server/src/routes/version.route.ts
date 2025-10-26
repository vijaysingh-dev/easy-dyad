import logger from "@/logger";
import db from "@/db";
import { apps, messages, versions } from "@/db/schema";
import { and, desc, gt } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { Router } from "express";
import * as fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import git, { type ReadCommitResult } from "isomorphic-git";
import { getEeziAppPath } from "@/services/paths";
import { IS_TEST_BUILD } from "@/config";
import { withLock } from "@/utils/lock_utils";
import { retryOnLocked } from "@/utils/retryOnLocked";
import { gitCheckout, gitCommit, gitStageToRevert } from "@/utils/git_utils";
import { storeDbTimestampAtCurrentVersion } from "@/utils/neon_timestamp_utils";
import { updatePostgresUrlEnvVar, updateDbPushEnvVar } from "@/utils/app_env_var_utils";
import {
  restoreBranchForPreview,
  switchPostgresToDevelopmentBranch,
} from "@/utils/misc_utils";
import {
  getNeonClient,
  getNeonErrorMessage,
} from "@/services/neon_admin/neon_management_client";
import { Version } from "@shared/eeziTypes";

const router = Router();

router.get("/get-app-version", async (req, res) => {
  // Read version from package.json at project root
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const packageJsonPath = path.resolve(__dirname, "..", "..", "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
  res.status(200).json({ version: packageJson.version });
});

router.get("/does-release-note-exist", async (req, res) => {
  // For E2E tests, we don't want to check for release notes
  // or show release notes, as it interferes with the tests.
  if (IS_TEST_BUILD) {
    res.status(200).json({ exists: false });
    return;
  }

  const { version } = req.query;
  if (!version || typeof version !== "string") {
    res.status(400).json({ error: "Invalid or missing version parameter" });
    return;
  }
  const releaseNoteUrl = `https://www.dyad.sh/docs/releases/${version}`;
  try {
    logger.debug(`Checking for release note at: ${releaseNoteUrl}`);
    const response = await fetch(releaseNoteUrl, { method: "HEAD" }); // Use HEAD to check existence without downloading content
    if (response.ok) {
      logger.debug(`Release note found for version ${version} at ${releaseNoteUrl}`);
      res.status(200).json({ exists: true, url: releaseNoteUrl });
    } else if (response.status === 404) {
      logger.debug(`Release note not found for version ${version} at ${releaseNoteUrl}`);
      res.status(200).json({ exists: false });
    } else {
      // Log other non-404 errors but still treat as "not found" for the client,
      // as the primary goal is to check existence.
      logger.warn(
        `Unexpected status code ${response.status} when checking for release note: ${releaseNoteUrl}`
      );
      res.status(200).json({ exists: false });
    }
  } catch (error: any) {
    logger.error(
      `Error fetching release note for version ${version} at ${releaseNoteUrl}:`,
      error
    );
    // In case of network errors, etc., assume it doesn't exist or is inaccessible.
    // Throwing an error here would propagate to the client and might be too disruptive
    // if the check is just for UI purposes (e.g., showing a link).
    // Consider if specific errors should be thrown based on requirements.
    res.status(404).json({ exists: false });
  }
});

router.get("/list-versions/:appId", async (req, res) => {
  try {
    const appId = parseInt(req.params.appId);
    const app = await db.query.apps.findFirst({
      where: eq(apps.id, appId),
    });

    if (!app) {
      // The app might have just been deleted, so we return an empty array.
      return [];
    }

    const appPath = getEeziAppPath(app.path);

    // Just return an empty array if the app is not a git repo.
    if (!fs.existsSync(path.join(appPath, ".git"))) {
      return [];
    }

    const commits = await git.log({
      fs,
      dir: appPath,
      // KEEP UP TO DATE WITH ChatHeader.tsx
      depth: 100_000, // Limit to last 100_000 commits for performance
    });

    // Get all snapshots for this app to match with commits
    const appSnapshots = await db.query.versions.findMany({
      where: eq(versions.appId, appId),
    });

    // Create a map of commitHash -> snapshot info for quick lookup
    const snapshotMap = new Map<
      string,
      { neonDbTimestamp: string | null; createdAt: Date }
    >();
    for (const snapshot of appSnapshots) {
      snapshotMap.set(snapshot.commitHash, {
        neonDbTimestamp: snapshot.neonDbTimestamp,
        createdAt: snapshot.createdAt,
      });
    }

    res.send(
      commits.map((commit: ReadCommitResult) => {
        const snapshotInfo = snapshotMap.get(commit.oid);
        return {
          oid: commit.oid,
          message: commit.commit.message,
          timestamp: commit.commit.author.timestamp,
          dbTimestamp: snapshotInfo?.neonDbTimestamp,
        };
      }) satisfies Version[]
    );
  } catch (error: any) {
    logger.error("Error getting versions:", error.message);
    res.status(500).json({ error: "Failed to retrieve versions" });
  }
});

router.get("/get-current-branch/:appId", async (req, res) => {
  try {
    const appId = parseInt(req.params.appId);
    const app = await db.query.apps.findFirst({
      where: eq(apps.id, appId),
    });

    if (!app) {
      throw new Error("App not found");
    }

    const appPath = getEeziAppPath(app.path);

    // Return appropriate result if the app is not a git repo
    if (!fs.existsSync(path.join(appPath, ".git"))) {
      throw new Error("Not a git repository");
    }

    try {
      const currentBranch = await git.currentBranch({
        fs,
        dir: appPath,
        fullname: false,
      });

      res.status(200).json({
        branch: currentBranch || "<no-branch>",
      });
    } catch (error: any) {
      logger.error(`Error getting current branch for app ${appId}:`, error);
      throw new Error(`Failed to get current branch: ${error.message}`);
    }
  } catch (error: any) {
    logger.error("Error getting current branch:", error.message);
    res.status(500).json({ error: "Failed to get current branch" });
  }
});

router.post("/revert-version", async (req, res) => {
  try {
    const { appId, previousVersionId } = req.body;
    const result = await withLock(appId, async () => {
      let successMessage = "Restored version";
      let warningMessage: string | undefined = undefined;
      const app = await db.query.apps.findFirst({
        where: eq(apps.id, appId),
      });

      if (!app) {
        throw new Error("App not found");
      }

      const appPath = getEeziAppPath(app.path);
      // Get the current commit hash before reverting
      const currentCommitHash = await git.resolveRef({
        fs,
        dir: appPath,
        ref: "main",
      });

      await gitCheckout({
        path: appPath,
        ref: "main",
      });

      if (app.neonProjectId && app.neonDevelopmentBranchId) {
        // We are going to add a new commit on top, so let's store
        // the current timestamp at the current version.
        await storeDbTimestampAtCurrentVersion({
          appId,
        });
      }

      await gitStageToRevert({
        path: appPath,
        targetOid: previousVersionId,
      });

      await gitCommit({
        path: appPath,
        message: `Reverted all changes back to version ${previousVersionId}`,
      });

      // Find the chat and message associated with the commit hash
      const messageWithCommit = await db.query.messages.findFirst({
        where: eq(messages.commitHash, previousVersionId),
        with: {
          chat: true,
        },
      });

      // If we found a message with this commit hash, delete all subsequent messages (but keep this message)
      if (messageWithCommit) {
        const chatId = messageWithCommit.chatId;

        // Find all messages in this chat with IDs > the one with our commit hash
        const messagesToDelete = await db.query.messages.findMany({
          where: and(eq(messages.chatId, chatId), gt(messages.id, messageWithCommit.id)),
          orderBy: desc(messages.id),
        });

        logger.log(
          `Deleting ${messagesToDelete.length} messages after commit ${previousVersionId} from chat ${chatId}`
        );

        // Delete the messages
        if (messagesToDelete.length > 0) {
          await db
            .delete(messages)
            .where(
              and(eq(messages.chatId, chatId), gt(messages.id, messageWithCommit.id))
            );
        }
      }

      if (app.neonProjectId && app.neonDevelopmentBranchId) {
        const version = await db.query.versions.findFirst({
          where: and(
            eq(versions.appId, appId),
            eq(versions.commitHash, previousVersionId)
          ),
        });
        if (version && version.neonDbTimestamp) {
          try {
            const preserveBranchName = `preserve_${currentCommitHash}-${Date.now()}`;
            const neonClient = await getNeonClient();
            const response = await retryOnLocked(
              () =>
                neonClient.restoreProjectBranch(
                  app.neonProjectId!,
                  app.neonDevelopmentBranchId!,
                  {
                    source_branch_id: app.neonDevelopmentBranchId!,
                    source_timestamp: version.neonDbTimestamp!,
                    preserve_under_name: preserveBranchName,
                  }
                ),
              `Restore development branch ${app.neonDevelopmentBranchId} for app ${appId}`
            );
            // Update all versions which have a newer DB timestamp than the version we're restoring to
            // and remove their DB timestamp.
            await db
              .update(versions)
              .set({ neonDbTimestamp: null })
              .where(
                and(
                  eq(versions.appId, appId),
                  gt(versions.neonDbTimestamp, version.neonDbTimestamp)
                )
              );

            const preserveBranchId = response.data.branch.parent_id;
            if (!preserveBranchId) {
              throw new Error("Preserve branch ID not found");
            }
            logger.info(`Deleting preserve branch ${preserveBranchId} for app ${appId}`);
            try {
              // Intentionally do not await this because it's not
              // critical for the restore operation, it's to clean up branches
              // so the user doesn't hit the branch limit later.
              retryOnLocked(
                () =>
                  neonClient.deleteProjectBranch(app.neonProjectId!, preserveBranchId),
                `Delete preserve branch ${preserveBranchId} for app ${appId}`,
                { retryBranchWithChildError: true }
              );
            } catch (error: any) {
              const errorMessage = getNeonErrorMessage(error);
              logger.error("Error in deleteProjectBranch:", errorMessage);
            }
          } catch (error: any) {
            const errorMessage = getNeonErrorMessage(error);
            logger.error("Error in restoreBranchForCheckout:", errorMessage);
            warningMessage = `Could not restore database because of error: ${errorMessage}`;
            // Do not throw, so we can finish switching the postgres branch
            // It might throw because they picked a timestamp that's too old.
          }
          successMessage = "Successfully restored to version (including database)";
        }
        await switchPostgresToDevelopmentBranch({
          neonProjectId: app.neonProjectId,
          neonDevelopmentBranchId: app.neonDevelopmentBranchId,
          appPath: app.path,
        });
      }
      if (warningMessage) {
        return { warningMessage };
      }
      return { successMessage };
    });
    res.send(result);
  } catch (error: any) {
    logger.error("Error reverting version:", error.message);
    res.status(500).json({ error: "Failed to revert version" });
  }
});

router.post("/checkout-version", async (req, res) => {
  try {
    const { appId, gitRef } = req.body;
    const result = await withLock(appId, async () => {
      const app = await db.query.apps.findFirst({
        where: eq(apps.id, appId),
      });

      if (!app) {
        throw new Error("App not found");
      }

      if (app.neonProjectId && app.neonDevelopmentBranchId && app.neonPreviewBranchId) {
        if (gitRef === "main") {
          logger.info(`Switching Postgres to development branch for app ${appId}`);
          await switchPostgresToDevelopmentBranch({
            neonProjectId: app.neonProjectId,
            neonDevelopmentBranchId: app.neonDevelopmentBranchId,
            appPath: app.path,
          });
        } else {
          logger.info(`Switching Postgres to preview branch for app ${appId}`);

          // Regardless of whether we have a timestamp or not, we want to disable DB push
          // while we're checking out an earlier version
          await updateDbPushEnvVar({
            appPath: app.path,
            disabled: true,
          });

          const version = await db.query.versions.findFirst({
            where: and(eq(versions.appId, appId), eq(versions.commitHash, gitRef)),
          });

          if (version && version.neonDbTimestamp) {
            // SWITCH the env var for POSTGRES_URL to the preview branch
            const neonClient = await getNeonClient();
            const connectionUri = await neonClient.getConnectionUri({
              projectId: app.neonProjectId,
              branch_id: app.neonPreviewBranchId,
              // This is the default database name for Neon
              database_name: "neondb",
              // This is the default role name for Neon
              role_name: "neondb_owner",
            });

            await restoreBranchForPreview({
              appId,
              dbTimestamp: version.neonDbTimestamp,
              neonProjectId: app.neonProjectId,
              previewBranchId: app.neonPreviewBranchId,
              developmentBranchId: app.neonDevelopmentBranchId,
            });

            await updatePostgresUrlEnvVar({
              appPath: app.path,
              connectionUri: connectionUri.data.uri,
            });
            logger.info(
              `Switched Postgres to preview branch for app ${appId} commit ${version.commitHash} dbTimestamp=${version.neonDbTimestamp}`
            );
          }
        }
      }
      const fullAppPath = getEeziAppPath(app.path);
      await gitCheckout({
        path: fullAppPath,
        ref: gitRef,
      });
    });
    res.send(result);
  } catch (error: any) {
    logger.error("Error checking out version:", error.message);
    res.status(500).json({ error: "Failed to checkout version" });
  }
});

export default router;
