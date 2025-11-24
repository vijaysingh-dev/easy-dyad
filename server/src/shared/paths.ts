import os from "node:os";
import fs from "fs";
import path from "node:path";
import { IS_TEST_BUILD } from "@/config";

export const SERVER_ROOT = path.resolve(__dirname, "..", "..");
console.log("SERVER_ROOT", SERVER_ROOT);
export const PROJECT_ROOT = path.resolve(SERVER_ROOT, "..");
console.log("PROJECT_ROOT", PROJECT_ROOT);

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
    | "sessionData"
    | "logs"
    | "userData"
    | "crashDumps"
    | "temp"
    | "exe"
    | "module"
    | "assets"
    | "desktop"
    | "documents"
    | "downloads"
    | "music"
    | "pictures"
    | "videos"
    | "recent"
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
    case "sessionData": {
      return path.join(tmp, appDir, "sessionData");
    }
    case "logs": {
      return path.join(IS_TEST_BUILD ? PROJECT_ROOT : home, "logs");
    }
    case "userData": {
      return path.join(IS_TEST_BUILD ? PROJECT_ROOT : home, "userData");
    }
    case "crashDumps": {
      return path.join(getPath("userData"), "crashDumps");
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
  let eeziAppPath = path.join(getPath("userData"), "eezi-apps");
  if (appPath) eeziAppPath = path.join(eeziAppPath, appPath);
  return eeziAppPath;
}

export function getTypeScriptCachePath(): string {
  return path.join(getPath("sessionData"), "typescript-cache");
}
