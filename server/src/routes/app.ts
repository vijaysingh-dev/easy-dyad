import db from "@/db";
import log from "@/logger";
import { Router } from "express";
import { desc, eq, like } from "drizzle-orm";
import * as git from "isomorphic-git";
import * as fs from "fs";
import { apps, chats, prompts } from "@/db/schema";
import { createFromTemplate } from "@/utils/createFromTemplate";
import { getFilesRecursively } from "@/utils/file_utils";
import { withLock } from "@/utils/lock_utils";
import { gitCommit } from "@/utils/git_utils";
import { getVercelTeamSlug } from "@/utils/vercel_utils";
import { getAllTemplates } from "@/utils/template_utils";
import { readSettings } from "@/services/settings";
import { getSupabaseProjectName } from "@/services/supabase/supabase_management_client";
import { localTemplatesData } from "@/services/llm/templates";
import { getEeziAppPath, normalizePath } from "@/services/paths";
import { type CreateAppParams } from "@shared/eeziTypes";

const logger = log.scope("app-route");
const router = Router();

// List all apps
router.get("/list-apps", async (_req, res) => {
  try {
    const allApps = await db.query.apps.findMany({
      orderBy: [desc(apps.createdAt)],
    });

    res.json({
      apps: allApps,
      appBasePath: getEeziAppPath("$APP_BASE_PATH"),
    });
  } catch (error) {
    logger.error("Error listing apps:", error);
    res.status(500).json({ error: "Failed to list apps" });
  }
});

router.get("/get-app/:appId", async (req, res) => {
  try {
    const appId = parseInt(req.params.appId);
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

    return {
      ...app,
      files,
      supabaseProjectName,
      vercelTeamSlug,
    };
  } catch (error) {
    logger.error("Error fetching app:", error);
    res.status(500).json({ error: "Failed to fetch app" });
  }
});

// Create a new app with an initial chat
router.post("/create-app", async (req, res) => {
  try {
    const params: CreateAppParams = req.body;
    const appPath = params.name;
    const fullAppPath = getEeziAppPath(appPath);
    if (fs.existsSync(fullAppPath)) {
      throw new Error(`App already exists at: ${fullAppPath}`);
    }
    // Create a new app
    const [app] = await db
      .insert(apps)
      .values({
        name: params.name,
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
  } catch (error) {
    logger.error("Error creating app:", error);
    res.status(500).json({ error: "Failed to create app" });
  }
});

router.post("add-to-favorite", async (req, res) => {
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
  } catch (error) {
    logger.error("Error toggling favorite status:", error);
    res.status(500).json({ error: "Failed to toggle favorite status" });
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
