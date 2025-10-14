import { Router, type Request, type Response } from "express";
import { execSync } from "child_process";
import { platform, arch } from "os";
import fixPath from "fix-path";
import { runShellCommand } from "../utils/runShellCommand";

const router = Router();

// GET /api/node/nodejs-status
router.get("/nodejs-status", async (_req: Request, res: Response) => {
  try {
    const [nodeVersion, pnpmVersion] = await Promise.all([
      runShellCommand("node --version"),
      runShellCommand(
        "pnpm --version || (corepack enable pnpm && pnpm --version) || (npm install -g pnpm@latest-10 && pnpm --version)",
      ),
    ]);

    let nodeDownloadUrl = "https://nodejs.org/dist/v22.14.0/node-v22.14.0.pkg";
    if (platform() == "win32") {
      if (arch() === "arm64" || arch() === "arm") {
        nodeDownloadUrl = "https://nodejs.org/dist/v22.14.0/node-v22.14.0-arm64.msi";
      } else {
        nodeDownloadUrl = "https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi";
      }
    }

    res.json({ ok: true, result: { nodeVersion, pnpmVersion, nodeDownloadUrl } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message ?? String(err) });
  }
});

// POST /api/node/reload-env-path
router.post("/reload-env-path", async (_req: Request, res: Response) => {
  try {
    if (platform() === "win32") {
      const newPath = execSync("cmd /c echo %PATH%", { encoding: "utf8" }).trim();
      process.env.PATH = newPath;
    } else {
      fixPath();
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message ?? String(err) });
  }
});

export default router;
