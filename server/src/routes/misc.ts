import { Router, type Request, type Response } from "express";
import open from "open";

const router = Router();

// POST /api/misc/open-external-url -> { url }
router.post("/open-external-url", async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const params = Array.isArray(body.args) && body.args.length > 0 ? body.args[0] : body;
    const url = params.url ?? params;
    if (!url || (typeof url === "string" && !/^https?:\/\//.test(url))) return res.status(400).json({ ok: false, error: "invalid url" });
    await open(url as string);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message ?? String(err) });
  }
});

// POST /api/misc/show-item-in-folder -> { fullPath }
router.post("/show-item-in-folder", (req: Request, res: Response) => {
  const body = req.body ?? {};
  const params = Array.isArray(body.args) && body.args.length > 0 ? body.args[0] : body;
  const fullPath = params.fullPath ?? params;
  if (!fullPath) return res.status(400).json({ ok: false, error: "fullPath required" });
  // Best-effort: on server we can't show file manager reliably; just return path
  res.json({ ok: true, result: { fullPath } });
});

export default router;
