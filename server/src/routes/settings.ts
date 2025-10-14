import { Router, type Request, type Response } from "express";
import fs from "node:fs";
import path from "node:path";

const router = Router();

const SETTINGS_FILE = path.join(process.cwd(), "user-settings.json");

function readSettingsFile() {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) return null;
    const raw = fs.readFileSync(SETTINGS_FILE, "utf-8");
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function writeSettingsFile(obj: any) {
  const existing = readSettingsFile() ?? {};
  const merged = { ...existing, ...obj };
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(merged, null, 2), "utf-8");
  return merged;
}

// GET /api/settings - returns stored settings (or {} if none)
router.get("/", (_req: Request, res: Response) => {
  const settings = readSettingsFile() ?? {};
  res.json(settings);
});

// POST /api/settings - merge and persist partial settings
router.post("/", (req: Request, res: Response) => {
  const body = req.body ?? {};
  try {
    const saved = writeSettingsFile(body);
    res.status(200).json(saved);
  } catch (err) {
    res.status(500).json({ error: "Failed to write settings" });
  }
});

export default router;
