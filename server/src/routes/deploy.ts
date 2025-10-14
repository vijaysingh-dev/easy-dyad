import { Router, type Request, type Response } from "express";
import fetch from "node-fetch";
import log from "electron-log";
import { IS_TEST_BUILD } from "../utils/test_utils";
import { writeSettings, readSettings } from "../main/settings";

const logger = log.scope("deploy");
const router = Router();

const TEST_SERVER_BASE = "http://localhost:3500";
const VERCEL_API_BASE = IS_TEST_BUILD ? `${TEST_SERVER_BASE}/vercel/api` : "https://api.vercel.com";

router.post("/vercel/save-token", async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const params = Array.isArray(body.args) && body.args.length > 0 ? body.args[0] : body;
    const token = params.token;
    if (!token) return res.status(400).json({ ok: false, error: "token required" });

    // Basic validation: try to fetch user info
    const resp = await fetch(`${VERCEL_API_BASE}/v1/user`, { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) return res.status(400).json({ ok: false, error: "Invalid token" });

    writeSettings({ vercelAccessToken: { value: token } });
    res.json({ ok: true });
  } catch (err: any) {
    logger.error("/vercel/save-token error", err);
    res.status(500).json({ ok: false, error: err?.message ?? String(err) });
  }
});

export default router;
