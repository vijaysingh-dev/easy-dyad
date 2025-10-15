import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { apps, chats, messages } from "../db/schema";
import { desc, eq, like } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { promises as fsPromises } from "node:fs";
import git from "isomorphic-git";
import { getDyadAppPath } from "../paths/paths";
import { gitCommit } from "../utils/git_utils";
import { deploySupabaseFunctions, isServerFunction } from "../supabase_admin/supabase_management_client";

const appRouter = Router();

// GET /api/apps -> list apps
appRouter.get("/", async (_req: Request, res: Response) => {
  const allApps = await db.query.apps.findMany({ orderBy: [desc(apps.createdAt)] });
  res.json({ ok: true, result: { apps: allApps, appBasePath: getDyadAppPath("$APP_BASE_PATH") } });
});

// GET /api/apps/:appId -> get app
appRouter.get("/:appId", async (req: Request, res: Response) => {
  const appId = Number(req.params.appId);
  const app = await db.query.apps.findFirst({ where: eq(apps.id, appId) });
  if (!app) return res.status(404).json({ ok: false, error: "App not found" });
  res.json({ ok: true, result: app });
});

// POST /api/apps/read-file -> { appId, filePath }
appRouter.post("/read-file", async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const params = Array.isArray(body.args) && body.args.length > 0 ? body.args[0] : body;
    const { appId, filePath } = params as { appId: number; filePath: string };
    const app = await db.query.apps.findFirst({ where: eq(apps.id, appId) });
    if (!app) return res.status(404).json({ ok: false, error: "App not found" });
    const appPath = getDyadAppPath(app.path);
    const fullPath = path.join(appPath, filePath);
    if (!fullPath.startsWith(appPath)) return res.status(400).json({ ok: false, error: "Invalid file path" });
    if (!fs.existsSync(fullPath)) return res.status(404).json({ ok: false, error: "File not found" });
    const contents = fs.readFileSync(fullPath, "utf-8");
    res.json({ ok: true, result: contents });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: String(err?.message ?? err) });
  }
});

// POST /api/apps/edit-file -> { appId, filePath, content }
appRouter.post("/edit-file", async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const params = Array.isArray(body.args) && body.args.length > 0 ? body.args[0] : body;
    const { appId, filePath, content } = params as { appId: number; filePath: string; content: string };
    const app = await db.query.apps.findFirst({ where: eq(apps.id, appId) });
    if (!app) return res.status(404).json({ ok: false, error: "App not found" });
    const appPath = getDyadAppPath(app.path);
    const fullPath = path.join(appPath, filePath);
    if (!fullPath.startsWith(appPath)) return res.status(400).json({ ok: false, error: "Invalid file path" });

    if (app.neonProjectId && app.neonDevelopmentBranchId) {
      // skip neon logic in this route (left as future work)
    }

    const dirPath = path.dirname(fullPath);
    await fsPromises.mkdir(dirPath, { recursive: true });
    await fsPromises.writeFile(fullPath, content, "utf-8");

    if (fs.existsSync(path.join(appPath, ".git"))) {
      await git.add({ fs: fs as any, dir: appPath, filepath: filePath });
      await gitCommit({ path: appPath, message: `Updated ${filePath}` });
    }

    if (isServerFunction(filePath) && app.supabaseProjectId) {
      try {
        await deploySupabaseFunctions({ supabaseProjectId: app.supabaseProjectId, functionName: path.basename(path.dirname(filePath)), content });
      } catch (error) {
        return res.json({ ok: true, warning: `File saved, but failed to deploy Supabase function: ${filePath}: ${error}` });
      }
    }

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: String(err?.message ?? err) });
  }
});

// POST /api/apps/search -> { searchQuery }
appRouter.post("/search", async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const params = Array.isArray(body.args) && body.args.length > 0 ? body.args[0] : body;
    const searchQuery = String(params.searchQuery ?? params.query ?? "");
    if (!searchQuery) return res.status(400).json({ ok: false, error: "searchQuery is required" });

    const pattern = `%${searchQuery.replace(/[%_]/g, "\\$&")}%`;
    const appNameMatches = await db.select({ id: apps.id, name: apps.name, createdAt: apps.createdAt }).from(apps).where(like(apps.name, pattern)).orderBy(desc(apps.createdAt));
    res.json({ ok: true, result: appNameMatches });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: String(err?.message ?? err) });
  }
});

// POST /api/apps/:appId/favorite -> toggle favorite
appRouter.post("/:appId/favorite", async (req: Request, res: Response) => {
  try {
    const appId = Number(req.params.appId);
    await db.transaction(async () => {
      const result = await db.select({ isFavorite: apps.isFavorite }).from(apps).where(eq(apps.id, appId)).limit(1);
      if (result.length === 0) throw new Error("App not found");
      const current = result[0].isFavorite;
      const updated = await db.update(apps).set({ isFavorite: !current }).where(eq(apps.id, appId)).returning({ isFavorite: apps.isFavorite });
      res.json({ ok: true, result: updated[0].isFavorite });
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: String(err?.message ?? err) });
  }
});

// GET /api/apps/version -> { version }
appRouter.get("/version", (req: Request, res: Response) => {
  try {
    const packageJsonPath = path.resolve(__dirname, "..", "..", "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
    res.json({ ok: true, result: { version: packageJson.version } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: String(err?.message ?? err) });
  }
});

export default appRouter;