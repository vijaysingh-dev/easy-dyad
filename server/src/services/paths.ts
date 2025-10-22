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
  const appName = "eezi";

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
      const userDataPath = path.join(getPath("appData"), appName);
      ensureDir(userDataPath);
      return userDataPath;
    }

    case "sessionData": {
      const sessionPath = path.join(tmp, appName, "sessionData");
      ensureDir(sessionPath);
      return sessionPath;
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

    case "logs": {
      const logsPath = path.join(getPath("userData"), "logs");
      ensureDir(logsPath);
      return logsPath;
    }

    case "crashDumps": {
      const crashPath = path.join(getPath("userData"), "crashDumps");
      ensureDir(crashPath);
      return crashPath;
    }

    default:
      throw new Error(`Unknown path name: ${name}`);
  }
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function getEeziAppPath(appPath: string): string {
  if (IS_TEST_BUILD) {
    return path.join(getPath("userData"), "eezi-apps", appPath);
  }
  return path.join(os.homedir(), "eezi-apps", appPath);
}

export function getTypeScriptCachePath(): string {
  return path.join(getPath("sessionData"), "typescript-cache");
}

/**
 * Gets the user data path, handling both Electron and non-Electron environments
 * In Electron: returns the app's userData directory
 * In non-Electron: returns "./userData" in the current directory
 */

export function getUserDataPath(): string {
  if (IS_TEST_BUILD) {
    // For development or when the Electron app object isn't available
    return path.resolve("../../userData");
  }
  return getPath("userData");
}
