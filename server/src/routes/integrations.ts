import { Router, type Request, type Response } from "express";
import fetch from "node-fetch";
import { readSettings, writeSettings } from "../main/settings";
import log from "electron-log";
import { IS_TEST_BUILD } from "../utils/test_utils";

const logger = log.scope("integrations");
const router = Router();

const TEST_SERVER_BASE = "http://localhost:3500";
const GITHUB_API_BASE = IS_TEST_BUILD ? `${TEST_SERVER_BASE}/github/api` : "https://api.github.com";

// GET /api/integrations/github/user
router.get("/github/user", async (_req: Request, res: Response) => {
  try {
    const settings = readSettings();
    const email = settings.githubUser?.email;
    if (email) return res.json({ ok: true, result: { email } });

    const accessToken = settings.githubAccessToken?.value;
    if (!accessToken) return res.json({ ok: true, result: null });

    const response = await fetch(`${GITHUB_API_BASE}/user/emails`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) return res.status(502).json({ ok: false, error: "Failed to fetch github emails" });
    const emails = await response.json();
    const primary = emails.find((e: any) => e.primary)?.email;
    if (primary) {
      writeSettings({ githubUser: { email: primary } });
      return res.json({ ok: true, result: { email: primary } });
    }
    res.json({ ok: true, result: null });
  } catch (err: any) {
    logger.error("/github/user error", err);
    res.status(500).json({ ok: false, error: err?.message ?? String(err) });
  }
});

// GET /api/integrations/github/repos
router.get("/github/repos", async (_req: Request, res: Response) => {
  try {
    const settings = readSettings();
    const accessToken = settings.githubAccessToken?.value;
    if (!accessToken) return res.status(401).json({ ok: false, error: "Not authenticated" });

    const response = await fetch(`${GITHUB_API_BASE}/user/repos?per_page=100&sort=updated`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.github+json" },
    });
    if (!response.ok) {
      const text = await response.text();
      logger.error("GitHub list repos failed:", text);
      return res.status(502).json({ ok: false, error: "Failed to list repos" });
    }
    const data = await response.json();
    res.json({ ok: true, result: data });
  } catch (err: any) {
    logger.error("/github/repos error", err);
    res.status(500).json({ ok: false, error: err?.message ?? String(err) });
  }
});

// POST /api/integrations/github/disconnect -> clears stored token
router.post("/github/disconnect", async (_req: Request, res: Response) => {
  try {
    writeSettings({ githubAccessToken: { value: null } });
    res.json({ ok: true });
  } catch (err: any) {
    logger.error("/github/disconnect error", err);
    res.status(500).json({ ok: false, error: err?.message ?? String(err) });
  }
});

export default router;
