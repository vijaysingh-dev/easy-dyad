import os from "node:os";
import path from "node:path";
import fs from "fs";
import { IS_TEST_BUILD } from "@/config";

/**
 * Normalize the path to use forward slashes instead of backslashes.
 * This is important to prevent weird Git issues, particularly on Windows.
 * @param path Source path.
 * @returns Normalized path.
 */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

export function getPath(
  name:
    | "home"
    | "appData"
    | "assets"
    | "userData"
    | "sessionData"
    | "temp"
    | "exe"
    | "module"
    | "desktop"
    | "documents"
    | "downloads"
    | "music"
    | "pictures"
    | "videos"
    | "recent"
    | "logs"
    | "crashDumps"
): string {
  const home = os.homedir();
  const tmp = os.tmpdir();
  const appDir = "eezi-apps";

  switch (name) {
    case "home":
      return home;

    case "appData":
      return (
        process.env.APPDATA ||
        (process.platform === "darwin"
          ? path.join(home, "Library", "Application Support")
          : path.join(home, ".config"))
      );

    case "userData": {
      return IS_TEST_BUILD
        ? path.resolve("../userData")
        : path.join(os.homedir(), "userData");
    }
    case "logs": {
      return path.join(getPath("userData"), "logs");
    }
    case "crashDumps": {
      return path.join(getPath("userData"), "crashDumps");
    }
    case "sessionData": {
      return path.join(tmp, appDir, "sessionData");
    }

    case "temp":
      return tmp;

    case "exe":
      return process.execPath;

    case "module":
      return path.dirname(require.main?.filename || process.cwd());

    case "assets":
      return path.join(process.cwd(), "assets");

    case "desktop":
      return path.join(home, "Desktop");

    case "documents":
      return path.join(home, "Documents");

    case "downloads":
      return path.join(home, "Downloads");

    case "music":
      return path.join(home, "Music");

    case "pictures":
      return path.join(home, "Pictures");

    case "videos":
      return path.join(home, "Videos");

    case "recent":
      return path.join(home, "Recent");

    default:
      throw new Error(`Unknown path name: ${name}`);
  }
}

export function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function getEeziAppPath(appPath?: string): string {
  let eeziAppPath = path.join(
    IS_TEST_BUILD ? getPath("userData") : os.homedir(),
    "eezi-apps"
  );
  if (appPath) eeziAppPath = path.join(eeziAppPath, appPath);
  return eeziAppPath;
}

export function getTypeScriptCachePath(): string {
  return path.join(getPath("sessionData"), "typescript-cache");
}
