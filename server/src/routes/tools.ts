import { Router, type Request, type Response } from "express";
import fetch from "node-fetch";

const router = Router();

// POST /api/tools/upload-to-signed-url
router.post("/upload-to-signed-url", async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const params = Array.isArray(body.args) && body.args.length > 0 ? body.args[0] : body;
    const { url, contentType, data } = params;
    if (!url || !contentType) return res.status(400).json({ ok: false, error: "url and contentType required" });

    const response = await fetch(url, { method: "PUT", headers: { "Content-Type": contentType }, body: JSON.stringify(data) });
    if (!response.ok) return res.status(502).json({ ok: false, error: `Upload failed: ${response.status}` });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message ?? String(err) });
  }
});

export default router;
