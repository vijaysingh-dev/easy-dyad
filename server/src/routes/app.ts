import log from "@/logger";
import db, { getDatabasePath } from "@/db";
import { apps, chats, prompts, messages } from "@/db/schema";
import { Router, Response } from "express";
import { desc, eq, like } from "drizzle-orm";
import * as git from "isomorphic-git";
import * as fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import fixPath from "fix-path";
import { createFromTemplate } from "@/utils/createFromTemplate";
import {
  getApp,
  copyDir,
  cleanUpPort,
  executeApp,
  getSystemDebugInfo,
  isComponentTaggerUpgradeNeeded,
  applyComponentTagger,
  isCapacitorInstalled,
  isCapacitorUpgradeNeeded,
  applyCapacitor,
} from "@/utils/app_utils";
import {
  runningApps,
  processCounter,
  removeAppIfCurrentProcess,
  stopAppByInfo,
  removeDockerVolumesForApp,
} from "@/utils/process_manager";
import { getFilesRecursively, copyDirectoryRecursive } from "@/utils/file_utils";
import { withLock } from "@/utils/lock_utils";
import { gitCommit } from "@/utils/git_utils";
import { getVercelTeamSlug } from "@/utils/vercel_utils";
import { getAllTemplates } from "@/utils/template_utils";
import { simpleSpawn } from "@/utils/simpleSpawn";
import { IS_TEST_BUILD } from "@/utils/test_utils";
import { safeSend } from "@/utils/safe_sender";
import { extractCodebase } from "@/utils/codebase";
import { validateChatContext } from "@/utils/context_paths_utils";
import { storeDbTimestampAtCurrentVersion } from "@/utils/neon_timestamp_utils";
import { isServerFunction } from "@/services/supabase/supabase_utils";
import { readSettings } from "@/services/settings";
import { generateProblemReport } from "@/services/processors/tsc";
import {
  deploySupabaseFunctions,
  getSupabaseProjectName,
} from "@/services/supabase/supabase_management_client";
import { localTemplatesData } from "@/services/llm/templates";
import { getEeziAppPath, normalizePath, getUserDataPath } from "@/services/paths";
import { type AppSearchResult } from "@shared/schemas";
import { AppUpgrade } from "@shared/eeziTypes";
import { tr } from "zod/v4/locales";

const logger = log.scope("app-route");
const router = Router();

// Needed, otherwise electron in MacOS/Linux will not be able
// to find node/pnpm.
fixPath();

router.post("/create-app", async (req, res) => {
  try {
    const { name } = req.body;
    const appPath = name;
    const fullAppPath = getEeziAppPath(appPath);
    if (fs.existsSync(fullAppPath)) {
      throw new Error(`App already exists at: ${fullAppPath}`);
    }
    // Create a new app
    const [app] = await db
      .insert(apps)
      .values({
        name: name,
        // Use the name as the path for now
        path: appPath,
      })
      .returning();

    // Create an initial chat for this app
    const [chat] = await db
      .insert(chats)
      .values({
        appId: app.id,
      })
      .returning();

    await createFromTemplate({
      fullAppPath,
    });

    // Initialize git repo and create first commit
    await git.init({
      fs: fs,
      dir: fullAppPath,
      defaultBranch: "main",
    });

    // Stage all files
    await git.add({
      fs: fs,
      dir: fullAppPath,
      filepath: ".",
    });

    // Create initial commit
    const commitHash = await gitCommit({
      path: fullAppPath,
      message: "Init Dyad app",
    });

    // Update chat with initial commit hash
    await db
      .update(chats)
      .set({
        initialCommitHash: commitHash,
      })
      .where(eq(chats.id, chat.id));

    res.json({ app, chatId: chat.id });
  } catch (error: any) {
    logger.error("Error creating app:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/copy-app", async (req, res) => {
  try {
    const { appId, newAppName, withHistory } = req.body;

    // 1. Check if an app with the new name already exists
    const existingApp = await db.query.apps.findFirst({
      where: eq(apps.name, newAppName),
    });

    if (existingApp) {
      throw new Error(`An app named "${newAppName}" already exists.`);
    }

    // 2. Find the original app
    const originalApp = await db.query.apps.findFirst({
      where: eq(apps.id, appId),
    });

    if (!originalApp) {
      throw new Error("Original app not found.");
    }

    const originalAppPath = getEeziAppPath(originalApp.path);
    const newAppPath = getEeziAppPath(newAppName);

    // 3. Copy the app folder
    try {
      await copyDir(originalAppPath, newAppPath, (source: string) => {
        if (!withHistory && path.basename(source) === ".git") {
          return false;
        }
        return true;
      });
    } catch (error) {
      logger.error("Failed to copy app directory:", error);
      throw new Error("Failed to copy app directory.");
    }

    if (!withHistory) {
      // Initialize git repo and create first commit
      await git.init({
        fs: fs,
        dir: newAppPath,
        defaultBranch: "main",
      });

      // Stage all files
      await git.add({
        fs: fs,
        dir: newAppPath,
        filepath: ".",
      });

      // Create initial commit
      await gitCommit({
        path: newAppPath,
        message: "Init Dyad app",
      });
    }

    // 4. Create a new app entry in the database
    const [newDbApp] = await db
      .insert(apps)
      .values({
        name: newAppName,
        path: newAppName, // Use the new name for the path
        // Explicitly set these to null because we don't want to copy them over.
        // Note: we could just leave them out since they're nullable field, but this
        // is to make it explicit we intentionally don't want to copy them over.
        supabaseProjectId: null,
        githubOrg: null,
        githubRepo: null,
        installCommand: originalApp.installCommand,
        startCommand: originalApp.startCommand,
      })
      .returning();

    res.json({ app: newDbApp });
  } catch (error: any) {
    logger.error("Error copying app:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/get-app/:appId", async (req, res) => {
  try {
    const appId = parseInt(req.params.appId, 10);
    const app = await db.query.apps.findFirst({
      where: eq(apps.id, appId),
    });

    if (!app) {
      throw new Error("App not found");
    }

    // Get app files
    const appPath = getEeziAppPath(app.path);
    let files: string[] = [];

    try {
      files = getFilesRecursively(appPath, appPath);
      // Normalize the path to use forward slashes so file tree (UI)
      // can parse it more consistently across platforms.
      files = files.map((path) => normalizePath(path));
    } catch (error) {
      logger.error(`Error reading files for app ${appId}:`, error);
      // Return app even if files couldn't be read
    }

    let supabaseProjectName: string | null = null;
    const settings = readSettings();
    if (app.supabaseProjectId && settings.supabase?.accessToken?.value) {
      supabaseProjectName = await getSupabaseProjectName(app.supabaseProjectId);
    }

    let vercelTeamSlug: string | null = null;
    if (app.vercelTeamId) {
      vercelTeamSlug = await getVercelTeamSlug(app.vercelTeamId);
    }

    res.json({
      ...app,
      files,
      supabaseProjectName,
      vercelTeamSlug,
    });
  } catch (error: any) {
    logger.error("Error getting app:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/list-apps", async (req, res) => {
  try {
    const allApps = await db.query.apps.findMany({
      orderBy: [desc(apps.createdAt)],
    });
    res.json({
      apps: allApps,
      appBasePath: getEeziAppPath("$APP_BASE_PATH"),
    });
  } catch (error: any) {
    logger.error("Error getting all apps:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/read-app-file/:appId/:filePath", async (req, res) => {
  try {
    const { appId, filePath } = req.params;
    const app = await db.query.apps.findFirst({
      where: eq(apps.id, parseInt(appId)),
    });

    if (!app) {
      throw new Error("App not found");
    }

    const appPath = getEeziAppPath(app.path);
    const fullPath = path.join(appPath, filePath);

    // Check if the path is within the app directory (security check)
    if (!fullPath.startsWith(appPath)) {
      throw new Error("Invalid file path");
    }

    if (!fs.existsSync(fullPath)) {
      throw new Error("File not found");
    }

    try {
      const contents = fs.readFileSync(fullPath, "utf-8");
      res.send(contents);
    } catch (error) {
      logger.error(`Error reading file ${filePath} for app ${appId}:`, error);
      throw new Error("Failed to read file");
    }
  } catch (error: any) {
    logger.error("Error reading app file:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/run-app/:appId", async (req, res) => {
  const appId = parseInt(req.params.appId, 10);
  try {
    // Set up SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    return withLock(appId, async () => {
      // Check if app is already running
      if (runningApps.has(appId)) {
        logger.debug(`App ${appId} is already running.`);
        return;
      }

      const app = await db.query.apps.findFirst({
        where: eq(apps.id, appId),
      });

      if (!app) {
        throw new Error("App not found");
      }

      logger.debug(`Starting app ${appId} in path ${app.path}`);

      const appPath = getEeziAppPath(app.path);
      try {
        // There may have been a previous run that left a process on port 32100.
        await cleanUpPort(32100);
        await executeApp({
          appPath,
          appId,
          res,
          isNeon: !!app.neonProjectId,
          installCommand: app.installCommand,
          startCommand: app.startCommand,
        });

        return;
      } catch (error: any) {
        logger.error(`Error running app ${appId}:`, error);
        // Ensure cleanup if error happens during setup but before process events are handled
        if (
          runningApps.has(appId) &&
          runningApps.get(appId)?.processId === processCounter.value
        ) {
          runningApps.delete(appId);
        }
        throw new Error(`Failed to run app ${appId}: ${error.message}`);
      }
    });
  } catch (error: any) {
    logger.error(`Error running app ${appId}:`, error);
    safeSend(res, "app:error", { appId, error: error.message });
  } finally {
    res.end();
  }
});

router.post("/stop-app", async (req, res): Promise<void> => {
  try {
    const { appId } = req.body;
    logger.log(
      `Attempting to stop app ${appId}. Current running apps: ${runningApps.size}`
    );
    const result = await withLock(appId, async () => {
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
    res.send(result);
  } catch (error: any) {
    logger.error(`Error in stop-app route:`, error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/restart-app/:appId", async (req, res) => {
  const appId = parseInt(req.params.appId, 10);
  const removeNodeModules = req.query.removeNodeModules === "true";
  try {
    // Set up SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    logger.log(`Restarting app ${appId}`);
    return withLock(appId, async () => {
      try {
        // First stop the app if it's running
        const appInfo = runningApps.get(appId);
        if (appInfo) {
          const { processId } = appInfo;
          logger.log(`Stopping app ${appId} (processId ${processId}) before restart`);
          await stopAppByInfo(appId, appInfo);
        } else {
          logger.log(`App ${appId} not running. Proceeding to start.`);
        }

        // There may have been a previous run that left a process on port 32100.
        await cleanUpPort(32100);

        // Now start the app again
        const app = await db.query.apps.findFirst({
          where: eq(apps.id, appId),
        });

        if (!app) {
          throw new Error("App not found");
        }

        const appPath = getEeziAppPath(app.path);

        // Remove node_modules if requested
        if (removeNodeModules) {
          const settings = readSettings();
          const runtimeMode = settings.runtimeMode2 ?? "host";

          const nodeModulesPath = path.join(appPath, "node_modules");
          logger.log(`Removing node_modules for app ${appId} at ${nodeModulesPath}`);
          if (fs.existsSync(nodeModulesPath)) {
            await fsPromises.rm(nodeModulesPath, {
              recursive: true,
              force: true,
            });
            logger.log(`Successfully removed node_modules for app ${appId}`);
          } else {
            logger.log(`No node_modules directory found for app ${appId}`);
          }

          // If running in Docker mode, also remove container volumes so deps reinstall freshly
          if (runtimeMode === "docker") {
            logger.log(
              `Docker mode detected for app ${appId}. Removing Docker volumes dyad-pnpm-${appId}...`
            );
            try {
              await removeDockerVolumesForApp(appId);
              logger.log(
                `Removed Docker volumes for app ${appId} (dyad-pnpm-${appId}).`
              );
            } catch (e) {
              // Best-effort cleanup; log and continue
              logger.warn(
                `Failed to remove Docker volumes for app ${appId}. Continuing: ${e}`
              );
            }
          }
        }

        logger.debug(`Executing app ${appId} in path ${app.path} after restart request`); // Adjusted log

        await executeApp({
          appPath,
          appId,
          res,
          isNeon: !!app.neonProjectId,
          installCommand: app.installCommand,
          startCommand: app.startCommand,
        }); // This will handle starting either mode

        return;
      } catch (error) {
        logger.error(`Error restarting app ${appId}:`, error);
        throw error;
      }
    });
  } catch (error: any) {
    logger.error(`Error restarting app ${appId}:`, error);
    safeSend(res, "app:error", { appId, error: error.message });
  } finally {
    res.end();
  }
});

router.post("/edit-app-file", async (req, res) => {
  try {
    const { appId, filePath, content } = req.body;
    const app = await db.query.apps.findFirst({
      where: eq(apps.id, appId),
    });

    if (!app) {
      throw new Error("App not found");
    }

    const appPath = getEeziAppPath(app.path);
    const fullPath = path.join(appPath, filePath);

    // Check if the path is within the app directory (security check)
    if (!fullPath.startsWith(appPath)) {
      throw new Error("Invalid file path");
    }

    if (app.neonProjectId && app.neonDevelopmentBranchId) {
      try {
        await storeDbTimestampAtCurrentVersion({
          appId: app.id,
        });
      } catch (error) {
        logger.error("Error storing Neon timestamp at current version:", error);
        throw new Error(
          "Could not store Neon timestamp at current version; database versioning functionality is not working: " +
            error
        );
      }
    }

    // Ensure directory exists
    const dirPath = path.dirname(fullPath);
    await fsPromises.mkdir(dirPath, { recursive: true });

    try {
      await fsPromises.writeFile(fullPath, content, "utf-8");

      // Check if git repository exists and commit the change
      if (fs.existsSync(path.join(appPath, ".git"))) {
        await git.add({
          fs,
          dir: appPath,
          filepath: filePath,
        });

        await gitCommit({
          path: appPath,
          message: `Updated ${filePath}`,
        });
      }
    } catch (error: any) {
      logger.error(`Error writing file ${filePath} for app ${appId}:`, error);
      throw new Error(`Failed to write file: ${error.message}`);
    }

    if (isServerFunction(filePath) && app.supabaseProjectId) {
      try {
        await deploySupabaseFunctions({
          supabaseProjectId: app.supabaseProjectId,
          functionName: path.basename(path.dirname(filePath)),
          content: content,
        });
      } catch (error) {
        logger.error(`Error deploying Supabase function ${filePath}:`, error);
        res.json({
          warning: `File saved, but failed to deploy Supabase function: ${filePath}: ${error}`,
        });
        return;
      }
    }
    res.json({ success: true });
  } catch (error: any) {
    logger.error("Error editing app file:", error);
    res.status(500).json({ error: error.message });
  }
});

router.delete("/delete-app/:appId", async (req, res) => {
  try {
    const appId = parseInt(req.params.appId, 10);
    // Static server worker is NOT terminated here anymore

    const result = await withLock(appId, async () => {
      // Check if app exists
      const app = await db.query.apps.findFirst({
        where: eq(apps.id, appId),
      });

      if (!app) {
        throw new Error("App not found");
      }

      // Stop the app if it's running
      if (runningApps.has(appId)) {
        const appInfo = runningApps.get(appId)!;
        try {
          logger.log(`Stopping app ${appId} before deletion.`); // Adjusted log
          await stopAppByInfo(appId, appInfo);
        } catch (error: any) {
          logger.error(`Error stopping app ${appId} before deletion:`, error); // Adjusted log
          // Continue with deletion even if stopping fails
        }
      }

      // Delete app from database
      try {
        await db.delete(apps).where(eq(apps.id, appId));
        // Note: Associated chats will cascade delete
      } catch (error: any) {
        logger.error(`Error deleting app ${appId} from database:`, error);
        throw new Error(`Failed to delete app from database: ${error.message}`);
      }

      // Delete app files
      const appPath = getEeziAppPath(app.path);
      try {
        await fsPromises.rm(appPath, { recursive: true, force: true });
      } catch (error: any) {
        logger.error(`Error deleting app files for app ${appId}:`, error);
        throw new Error(
          `App deleted from database, but failed to delete app files. Please delete app files from ${appPath} manually.\n\nError: ${error.message}`
        );
      }
    });
    res.send(result);
  } catch (error: any) {
    logger.error("Error deleting app:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/add-to-favorite", async (req, res) => {
  try {
    const { appId } = req.body;
    const result = await withLock(appId, async () => {
      try {
        // Fetch the current isFavorite value
        const result = await db
          .select({ isFavorite: apps.isFavorite })
          .from(apps)
          .where(eq(apps.id, appId))
          .limit(1);

        if (result.length === 0) {
          throw new Error(`App with ID ${appId} not found.`);
        }

        const currentIsFavorite = result[0].isFavorite;

        // Toggle the isFavorite value
        const updated = await db
          .update(apps)
          .set({ isFavorite: !currentIsFavorite })
          .where(eq(apps.id, appId))
          .returning({ isFavorite: apps.isFavorite });

        if (updated.length === 0) {
          throw new Error(`Failed to update favorite status for app ID ${appId}.`);
        }

        // Return the updated isFavorite value
        return { isFavorite: updated[0].isFavorite };
      } catch (error: any) {
        logger.error(`Error in add-to-favorite handler for app ID ${appId}:`, error);
        throw new Error(`Failed to toggle favorite status: ${error.message}`);
      }
    });
    res.json(result);
  } catch (error: any) {
    logger.error("Error toggling favorite status:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/rename-app", async (req, res) => {
  try {
    const { appId, appName, appPath } = req.body;
    const result = await withLock(appId, async () => {
      // Check if app exists
      const app = await db.query.apps.findFirst({
        where: eq(apps.id, appId),
      });

      if (!app) {
        throw new Error("App not found");
      }

      // Check for conflicts with existing apps
      const nameConflict = await db.query.apps.findFirst({
        where: eq(apps.name, appName),
      });

      const pathConflict = await db.query.apps.findFirst({
        where: eq(apps.path, appPath),
      });

      if (nameConflict && nameConflict.id !== appId) {
        throw new Error(`An app with the name '${appName}' already exists`);
      }

      if (pathConflict && pathConflict.id !== appId) {
        throw new Error(`An app with the path '${appPath}' already exists`);
      }

      // Stop the app if it's running
      if (runningApps.has(appId)) {
        const appInfo = runningApps.get(appId)!;
        try {
          await stopAppByInfo(appId, appInfo);
        } catch (error: any) {
          logger.error(`Error stopping app ${appId} before renaming:`, error);
          throw new Error(`Failed to stop app before renaming: ${error.message}`);
        }
      }

      const oldAppPath = getEeziAppPath(app.path);
      const newAppPath = getEeziAppPath(appPath);
      // Only move files if needed
      if (newAppPath !== oldAppPath) {
        // Move app files
        try {
          // Check if destination directory already exists
          if (fs.existsSync(newAppPath)) {
            throw new Error(`Destination path '${newAppPath}' already exists`);
          }

          // Create parent directory if it doesn't exist
          await fsPromises.mkdir(path.dirname(newAppPath), {
            recursive: true,
          });

          // Copy the directory without node_modules
          await copyDir(oldAppPath, newAppPath);
        } catch (error: any) {
          logger.error(
            `Error moving app files from ${oldAppPath} to ${newAppPath}:`,
            error
          );
          throw new Error(`Failed to move app files: ${error.message}`);
        }

        try {
          // Delete the old directory
          await fsPromises.rm(oldAppPath, { recursive: true, force: true });
        } catch (error: any) {
          // Why is this just a warning? This happens quite often on Windows
          // because it has an aggressive file lock.
          //
          // Not deleting the old directory is annoying, but not a big deal
          // since the user can do it themselves if they need to.
          logger.warn(`Error deleting old app directory ${oldAppPath}:`, error);
        }
      }

      // Update app in database
      try {
        const data = await db
          .update(apps)
          .set({
            name: appName,
            path: appPath,
          })
          .where(eq(apps.id, appId))
          .returning();

        return data;
      } catch (error: any) {
        // Attempt to rollback the file move
        if (newAppPath !== oldAppPath) {
          try {
            // Copy back from new to old
            await copyDir(newAppPath, oldAppPath);
            // Delete the new directory
            await fsPromises.rm(newAppPath, { recursive: true, force: true });
          } catch (rollbackError) {
            logger.error(
              `Failed to rollback file move during rename error:`,
              rollbackError
            );
          }
        }

        logger.error(`Error updating app ${appId} in database:`, error);
        throw new Error(`Failed to update app in database: ${error.message}`);
      }
    });
    res.send(result);
  } catch (error: any) {
    logger.error("Error renaming app:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("reset-all", async (req, res) => {
  try {
    logger.log("start: resetting all apps and settings.");
    // Stop all running apps first
    logger.log("stopping all running apps...");
    const runningAppIds = Array.from(runningApps.keys());
    for (const appId of runningAppIds) {
      try {
        const appInfo = runningApps.get(appId)!;
        await stopAppByInfo(appId, appInfo);
      } catch (error) {
        ``;
        logger.error(`Error stopping app ${appId} during reset:`, error);
        // Continue with reset even if stopping fails
      }
    }
    logger.log("all running apps stopped.");
    logger.log("deleting database...");
    // 1. Drop the database by deleting the SQLite file
    const dbPath = getDatabasePath();
    if (fs.existsSync(dbPath)) {
      // Close database connections first
      if (db.$client) {
        db.$client.close();
      }
      await fsPromises.unlink(dbPath);
      logger.log(`Database file deleted: ${dbPath}`);
    }
    logger.log("database deleted.");
    logger.log("deleting settings...");
    // 2. Remove settings
    const userDataPath = getUserDataPath();
    const settingsPath = path.join(userDataPath, "user-settings.json");

    if (fs.existsSync(settingsPath)) {
      await fsPromises.unlink(settingsPath);
      logger.log(`Settings file deleted: ${settingsPath}`);
    }
    logger.log("settings deleted.");
    // 3. Remove all app files recursively
    // Doing this last because it's the most time-consuming and the least important
    // in terms of resetting the app state.
    logger.log("removing all app files...");
    const dyadAppPath = getEeziAppPath(".");
    if (fs.existsSync(dyadAppPath)) {
      await fsPromises.rm(dyadAppPath, { recursive: true, force: true });
      // Recreate the base directory
      await fsPromises.mkdir(dyadAppPath, { recursive: true });
    }
    logger.log("all app files removed.");
    logger.log("reset all complete.");
    res.json({ success: true });
  } catch (error: any) {
    logger.error("Error resetting all apps and settings:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/get-app-version", async (req, res) => {
  try {
    // Read version from package.json at project root
    const packageJsonPath = path.resolve(__dirname, "..", "..", "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
    res.json({ version: packageJson.version });
  } catch (error: any) {
    logger.error("Error getting app version:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/respond-to-app-input", async (req, res) => {
  try {
    const { appId, response } = req.body;
    if (response !== "y" && response !== "n") {
      throw new Error(`Invalid response: ${response}`);
    }
    const appInfo = runningApps.get(appId);

    if (!appInfo) {
      throw new Error(`App ${appId} is not running`);
    }

    const { process } = appInfo;

    if (!process.stdin) {
      throw new Error(`App ${appId} process has no stdin available`);
    }

    try {
      // Write the response to stdin with a newline
      process.stdin.write(`${response}\n`);
      logger.debug(`Sent response '${response}' to app ${appId} stdin`);
    } catch (error: any) {
      logger.error(`Error sending response to app ${appId}:`, error);
      throw new Error(`Failed to send response to app: ${error.message}`);
    }
    res.json({ success: true });
  } catch (error: any) {
    logger.error("Error responding to app input:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/search-app", async (req, res) => {
  try {
    const { searchQuery } = req.body;
    // Use parameterized query to prevent SQL injection
    const pattern = `%${searchQuery.replace(/[%_]/g, "\\$&")}%`;

    // 1) Apps whose name matches
    const appNameMatches = await db
      .select({
        id: apps.id,
        name: apps.name,
        createdAt: apps.createdAt,
      })
      .from(apps)
      .where(like(apps.name, pattern))
      .orderBy(desc(apps.createdAt));

    const appNameMatchesResult: AppSearchResult[] = appNameMatches.map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.createdAt,
      matchedChatTitle: null,
      matchedChatMessage: null,
    }));

    // 2) Apps whose chat title matches
    const chatTitleMatches = await db
      .select({
        id: apps.id,
        name: apps.name,
        createdAt: apps.createdAt,
        matchedChatTitle: chats.title,
      })
      .from(apps)
      .innerJoin(chats, eq(apps.id, chats.appId))
      .where(like(chats.title, pattern))
      .orderBy(desc(apps.createdAt));

    const chatTitleMatchesResult: AppSearchResult[] = chatTitleMatches.map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.createdAt,
      matchedChatTitle: r.matchedChatTitle,
      matchedChatMessage: null,
    }));

    // 3) Apps whose chat message content matches
    const chatMessageMatches = await db
      .select({
        id: apps.id,
        name: apps.name,
        createdAt: apps.createdAt,
        matchedChatTitle: chats.title,
        matchedChatMessage: messages.content,
      })
      .from(apps)
      .innerJoin(chats, eq(apps.id, chats.appId))
      .innerJoin(messages, eq(chats.id, messages.chatId))
      .where(like(messages.content, pattern))
      .orderBy(desc(apps.createdAt));

    // Flatten and dedupe by app id
    const allMatches: AppSearchResult[] = [
      ...appNameMatchesResult,
      ...chatTitleMatchesResult,
      ...chatMessageMatches,
    ];
    const uniqueApps = Array.from(
      new Map(allMatches.map((app) => [app.id, app])).values()
    );

    // Sort newest apps first
    uniqueApps.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    res.json(uniqueApps);
  } catch (error: any) {
    logger.error("Error searching apps:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/get-templates", async (req, res) => {
  try {
    const templates = await getAllTemplates();
    res.json(templates);
  } catch (error) {
    logger.error("Error fetching templates:", error);
    res.status(500).json(localTemplatesData);
  }
});

// // Handler for selecting an app folder
// handle("select-app-folder", async () => {
//   const result = await dialog.showOpenDialog({
//     properties: ["openDirectory"],
//     title: "Select App Folder to Import",
//   });

//   if (result.canceled) {
//     return { path: null, name: null };
//   }

//   const selectedPath = result.filePaths[0];
//   const folderName = path.basename(selectedPath);

//   return { path: selectedPath, name: folderName };
// });

// Handler for checking if AI_RULES.md exists
router.get("/check-ai-rules", async (req, res) => {
  try {
    const appPath = req.query.path as string;
    await fsPromises.access(path.join(appPath, "AI_RULES.md"));
    res.json({ exists: true });
  } catch {
    res.status(404).json({ exists: false });
  }
});

// Handler for checking if an app name is already taken
router.get("/check-app-name", async (req, res) => {
  const appName = req.query.appName as string;
  try {
    // Check filesystem
    const appPath = getEeziAppPath(appName);
    await fsPromises.access(appPath);
    res.json({ exists: true });
  } catch {
    // Path doesn't exist, continue checking database
  }

  // Check database
  const existingApp = await db.query.apps.findFirst({
    where: eq(apps.name, appName),
  });

  res.json({ exists: !!existingApp });
});

// Handler for importing an app
router.post("/import-app", async (req, res) => {
  try {
    const { sourcePath, appName, installCommand, startCommand } = req.body;

    // Validate the source path exists
    try {
      await fsPromises.access(sourcePath);
    } catch {
      throw new Error("Source folder does not exist");
    }

    const destPath = getEeziAppPath(appName);

    // Check if the app already exists
    const errorMessage = "An app with this name already exists";
    try {
      await fsPromises.access(destPath);
      throw new Error(errorMessage);
    } catch (error: any) {
      if (error.message === errorMessage) {
        throw error;
      }
    }
    // Copy the app folder to the Dyad apps directory.
    // Why not use fs.cp? Because we want stable ordering for
    // tests.
    await copyDirectoryRecursive(sourcePath, destPath);

    const isGitRepo = await fsPromises
      .access(path.join(destPath, ".git"))
      .then(() => true)
      .catch(() => false);
    if (!isGitRepo) {
      // Initialize git repo and create first commit
      await git.init({
        fs: fs,
        dir: destPath,
        defaultBranch: "main",
      });

      // Stage all files
      await git.add({
        fs: fs,
        dir: destPath,
        filepath: ".",
      });

      // Create initial commit
      await gitCommit({
        path: destPath,
        message: "Init Dyad app",
      });
    }

    // Create a new app
    const [app] = await db
      .insert(apps)
      .values({
        name: appName,
        // Use the name as the path for now
        path: appName,
        installCommand: installCommand ?? null,
        startCommand: startCommand ?? null,
      })
      .returning();

    // Create an initial chat for this app
    const [chat] = await db
      .insert(chats)
      .values({
        appId: app.id,
      })
      .returning();
    res.json({ appId: app.id, chatId: chat.id });
  } catch (error) {
    logger.error("Error importing app:", error);
    res.status(500).json({ error: "Failed to import app" });
  }
});

const availableUpgrades: Omit<AppUpgrade, "isNeeded">[] = [
  {
    id: "component-tagger",
    title: "Enable select component to edit",
    description: "Installs the Dyad component tagger Vite plugin and its dependencies.",
    manualUpgradeUrl: "https://dyad.sh/docs/upgrades/select-component",
  },
  {
    id: "capacitor",
    title: "Upgrade to hybrid mobile app with Capacitor",
    description:
      "Adds Capacitor to your app lets it run on iOS and Android in addition to the web.",
    manualUpgradeUrl: "https://dyad.sh/docs/guides/mobile-app#upgrade-your-app",
  },
];

router.get("/get-app-upgrades", async (req, res) => {
  try {
    const appId = parseInt(req.query.appId as string);
    const app = await getApp(appId);
    const appPath = getEeziAppPath(app.path);

    const upgradesWithStatus = availableUpgrades.map((upgrade) => {
      let isNeeded = false;
      if (upgrade.id === "component-tagger") {
        isNeeded = isComponentTaggerUpgradeNeeded(appPath);
      } else if (upgrade.id === "capacitor") {
        isNeeded = isCapacitorUpgradeNeeded(appPath);
      }
      return { ...upgrade, isNeeded };
    });

    return upgradesWithStatus;
  } catch (error) {
    logger.error("Error fetching app upgrades:", error);
    res.status(500).json({ error: "Failed to fetch app upgrades" });
  }
});

router.post("/execute-app-upgrade", async (req, res) => {
  try {
    const { appId, upgradeId } = req.body;
    if (!upgradeId) {
      throw new Error("upgradeId is required");
    }

    const app = await getApp(appId);
    const appPath = getEeziAppPath(app.path);

    if (upgradeId === "component-tagger") {
      await applyComponentTagger(appPath);
    } else if (upgradeId === "capacitor") {
      await applyCapacitor({ appName: app.name, appPath });
    } else {
      throw new Error(`Unknown upgrade id: ${upgradeId}`);
    }
  } catch (error) {
    logger.error("Error executing app upgrade:", error);
    res.status(500).json({ error: "Failed to execute app upgrade" });
  }
});

router.get("/is-capacitor", async (req, res) => {
  try {
    const appId = parseInt(req.query.appId as string);
    const app = await getApp(appId);
    const appPath = getEeziAppPath(app.path);

    // check for the required Node.js version before running any commands
    const currentNodeVersion = process.version;
    const majorVersion = parseInt(currentNodeVersion.slice(1).split(".")[0], 10);

    if (majorVersion < 20) {
      // version is too old? stop and throw a clear error
      throw new Error(
        `Capacitor requires Node.js v20 or higher, but you are using ${currentNodeVersion}. Please upgrade your Node.js and try again.`
      );
    }
    res.json({ isCapacitor: isCapacitorInstalled(appPath) });
  } catch (error) {
    logger.error("Error checking if app is Capacitor:", error);
    res.status(500).json({ error: "Failed to check if app is Capacitor" });
  }
});

router.get("/sync-capacitor", async (req, res) => {
  try {
    const appId = parseInt(req.query.appId as string);
    const app = await getApp(appId);
    const appPath = getEeziAppPath(app.path);

    if (!isCapacitorInstalled(appPath)) {
      throw new Error("Capacitor is not installed in this app");
    }

    await simpleSpawn({
      command: "npm run build",
      cwd: appPath,
      successMessage: "App built successfully",
      errorPrefix: "Failed to build app",
    });

    await simpleSpawn({
      command: "npx cap sync",
      cwd: appPath,
      successMessage: "Capacitor sync completed successfully",
      errorPrefix: "Failed to sync Capacitor",
      env: {
        ...process.env,
        LANG: "en_US.UTF-8",
      },
    });
    res.json({ success: true });
  } catch (error) {
    logger.error("Error syncing Capacitor:", error);
    res.status(500).json({ error: "Failed to sync Capacitor" });
  }
});

router.get("/open-ios", async (req, res) => {
  try {
    const appId = parseInt(req.query.appId as string);
    const app = await getApp(appId);
    const appPath = getEeziAppPath(app.path);

    if (!isCapacitorInstalled(appPath)) {
      throw new Error("Capacitor is not installed in this app");
    }

    if (IS_TEST_BUILD) {
      // In test mode, just log the action instead of actually opening Xcode
      logger.info("Test mode: Simulating opening iOS project in Xcode");
      return;
    }

    await simpleSpawn({
      command: "npx cap open ios",
      cwd: appPath,
      successMessage: "iOS project opened successfully",
      errorPrefix: "Failed to open iOS project",
    });
  } catch (error) {
    logger.error("Error opening iOS project:", error);
    res.status(500).json({ error: "Failed to open iOS project" });
  }
});

router.get("/open-android", async (req, res) => {
  try {
    const appId = parseInt(req.query.appId as string);

    const app = await getApp(appId);
    const appPath = getEeziAppPath(app.path);

    if (!isCapacitorInstalled(appPath)) {
      throw new Error("Capacitor is not installed in this app");
    }

    if (IS_TEST_BUILD) {
      // In test mode, just log the action instead of actually opening Android Studio
      logger.info("Test mode: Simulating opening Android project in Android Studio");
      return;
    }

    await simpleSpawn({
      command: "npx cap open android",
      cwd: appPath,
      successMessage: "Android project opened successfully",
      errorPrefix: "Failed to open Android project",
    });
  } catch (error) {
    logger.error("Error opening Android project:", error);
    res.status(500).json({ error: "Failed to open Android project" });
  }
});

// Handler to check problems using autofix with empty response
router.get("/check-problems", async (req, res) => {
  try {
    const appId = parseInt(req.query.appId as string);
    // Get the app to find its path
    const app = await db.query.apps.findFirst({
      where: eq(apps.id, appId),
    });

    if (!app) {
      throw new Error(`App not found: ${appId}`);
    }

    const appPath = getEeziAppPath(app.path);

    // Call autofix with empty full response to just run TypeScript checking
    const problemReport = await generateProblemReport({
      fullResponse: "",
      appPath,
    });

    res.json(problemReport);
  } catch (error) {
    logger.error("Error checking problems:", error);
    res.status(500).json({ error: "Failed to check problems" });
  }
});

// --- Debug Routes ---
router.get("/get-system-debug-info", async (req, res) => {
  try {
    logger.info("get-system-debug-info called");
    const result = await getSystemDebugInfo({
      linesOfLogs: 20,
      level: "warn",
    });
    res.json(result);
  } catch (error) {
    logger.error("Error getting system debug info:", error);
    res.status(500).json({ error: "Failed to get system debug info" });
  }
});

router.get("/get-chat-logs/:chatId", async (req, res) => {
  try {
    const chatId = parseInt(req.params.chatId, 10);
    // We can retrieve a lot more lines here because we're not limited by the
    // GitHub issue URL length limit.
    const debugInfo = await getSystemDebugInfo({
      linesOfLogs: 1_000,
      level: "info",
    });

    // Get chat data from database
    const chatRecord = await db.query.chats.findFirst({
      where: eq(chats.id, chatId),
      with: {
        messages: {
          orderBy: (messages, { asc }) => [asc(messages.createdAt)],
        },
      },
    });

    if (!chatRecord) {
      throw new Error(`Chat with ID ${chatId} not found`);
    }

    // Format the chat to match the Chat interface
    const chat = {
      id: chatRecord.id,
      title: chatRecord.title || "Untitled Chat",
      messages: chatRecord.messages.map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        approvalState: msg.approvalState,
      })),
    };

    // Get app data from database
    const app = await db.query.apps.findFirst({
      where: eq(apps.id, chatRecord.appId),
    });

    if (!app) {
      throw new Error(`App with ID ${chatRecord.appId} not found`);
    }

    // Extract codebase
    const appPath = getEeziAppPath(app.path);
    const codebase = (
      await extractCodebase({
        appPath,
        chatContext: validateChatContext(app.chatContext),
      })
    ).formattedOutput;

    res.json({
      debugInfo,
      chat,
      codebase,
    });
  } catch (error) {
    console.error(`Failed to get chat logs:`, error);
    res.status(500).json({ error: "Failed to get chat logs" });
  }
});
// --- End Debug Routes ---

router.post("/upload-to-signed-url", async (req, res) => {
  try {
    const { url, contentType, data } = req.body;
    logger.debug("IPC: upload-to-signed-url called");

    // Validate the signed URL
    if (!url || typeof url !== "string" || !url.startsWith("https://")) {
      throw new Error("Invalid signed URL provided");
    }

    // Validate content type
    if (!contentType || typeof contentType !== "string") {
      throw new Error("Invalid content type provided");
    }

    // Perform the upload to the signed URL
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(
        `Upload failed with status ${response.status}: ${response.statusText}`
      );
    }

    logger.debug("Successfully uploaded data to signed URL");
    res.json(await response.json());
  } catch (error) {
    logger.error("Error uploading to signed URL:", error);
    res.status(500).json({ error: "Failed to upload to signed URL" });
  }
});

// --- Prompts Library ---
router.get("/prompts", async (req, res) => {
  try {
    const rows = db.select().from(prompts).all();
    res.json(
      rows.map((r) => ({
        id: r.id!,
        title: r.title,
        description: r.description ?? null,
        content: r.content,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }))
    );
  } catch (error) {
    logger.error("Error fetching prompts:", error);
    res.status(500).json({ error: "Failed to fetch prompts" });
  }
});

router.post("/prompts", async (req, res) => {
  try {
    const { title, description, content } = req.body;
    if (!title || !content) {
      throw new Error("Title and content are required");
    }
    const result = db
      .insert(prompts)
      .values({
        title,
        description: description ?? null,
        content,
      })
      .run();

    const id = Number(result.lastInsertRowid);
    const row = db.select().from(prompts).where(eq(prompts.id, id)).get();
    if (!row) throw new Error("Failed to fetch created prompt");
    res.json({
      id: row.id!,
      title: row.title,
      description: row.description ?? null,
      content: row.content,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  } catch (error) {
    logger.error("Error creating prompt:", error);
    res.status(500).json({ error: "Failed to create prompt" });
  }
});

router.patch("/prompts", async (req, res) => {
  try {
    const { id, title, description, content } = req.body;
    if (!id) throw new Error("Prompt id is required");
    if (!title || !content) throw new Error("Title and content are required");
    const now = new Date();
    db.update(prompts)
      .set({
        title,
        description: description ?? null,
        content,
        updatedAt: now,
      })
      .where(eq(prompts.id, id))
      .run();
    res.json({ message: "Prompt updated successfully" });
  } catch (error) {
    logger.error("Error updating prompt:", error);
    res.status(500).json({ error: "Failed to update prompt" });
  }
});

router.delete("/prompts/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) throw new Error("Prompt id is required");
    db.delete(prompts).where(eq(prompts.id, id)).run();
    res.json({ message: "Prompt deleted successfully" });
  } catch (error) {
    logger.error("Error deleting prompt:", error);
    res.status(500).json({ error: "Failed to delete prompt" });
  }
});
// --- End Prompts Library ---
export default router;
