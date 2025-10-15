import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { apps, chats } from "../db/schema";
import { eq } from "drizzle-orm";

const router = Router();



// GET /api/version/list-versions?appId=123 or POST with { args: [ { appId } ] }
router.all("/list-versions", async (req: Request, res: Response) => {
  try {
    const body = req.method === "GET" ? req.query : req.body ?? {};
    const appId = Array.isArray((body as any).args) && (body as any).args.length > 0 ? Number((body as any).args[0].appId ?? (body as any).args[0]) : Number((body as any).appId ?? (req.query.appId as string));
    if (!appId) return res.status(400).json({ ok: false, error: "appId is required" });

    const app = await db.query.apps.findFirst({ where: eq(apps.id, appId) });
    if (!app) return res.json({ ok: true, result: [] });

    const appPath = getDyadAppPath(app.path);
    if (!fs.existsSync(path.join(appPath, ".git"))) return res.json({ ok: true, result: [] });

    const commits = await git.log({ fs: fs as any, dir: appPath, depth: 100_000 });
    const appSnapshots = await db.query.versions.findMany({ where: eq(versions.appId, appId) });

    const snapshotMap = new Map<string, { neonDbTimestamp: string | null; createdAt: Date }>();
    for (const snapshot of appSnapshots) {
      snapshotMap.set(snapshot.commitHash, { neonDbTimestamp: snapshot.neonDbTimestamp, createdAt: snapshot.createdAt });
    }

    const result = commits.map((commit: any) => {
      const snapshotInfo = snapshotMap.get(commit.oid);
      return { oid: commit.oid, message: commit.commit.message, timestamp: commit.commit.author.timestamp, dbTimestamp: snapshotInfo?.neonDbTimestamp };
    });

    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message ?? String(err) });
  }
});

// GET /api/version/get-current-branch?appId=123
router.get("/get-current-branch", async (req: Request, res: Response) => {
  try {
    const appId = Number(req.query.appId as string);
    if (!appId) return res.status(400).json({ ok: false, error: "appId is required" });

    const app = await db.query.apps.findFirst({ where: eq(apps.id, appId) });
    if (!app) return res.status(404).json({ ok: false, error: "App not found" });

    const appPath = getDyadAppPath(app.path);
    if (!fs.existsSync(path.join(appPath, ".git"))) return res.status(400).json({ ok: false, error: "Not a git repository" });

    try {
      const currentBranch = await git.currentBranch({ fs: fs as any, dir: appPath, fullname: false });
      res.json({ ok: true, result: { branch: currentBranch || "<no-branch>" } });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message ?? String(err) });
    }
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message ?? String(err) });
  }
});
export default router;
