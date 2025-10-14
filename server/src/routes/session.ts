import { Router, type Request, type Response } from "express";
import fs from "node:fs/promises";
import { getTypeScriptCachePath } from "../paths/paths";

const router = Router();

// POST /api/session/clear-session-data
router.post("/clear-session-data", async (_req: Request, res: Response) => {
  try {
    // In the Electron app this cleared session storage and cookies. On server
    // side we can't clear browser storage, so we perform any server-side cache cleanup.
    try {
      await fs.rm(getTypeScriptCachePath(), { recursive: true, force: true });
    } catch (e) {
      // ignore
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: String(err?.message ?? err) });
  }
});

export default router;
