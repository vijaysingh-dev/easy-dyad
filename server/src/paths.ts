import fs from "fs";
import path from "node:path";
import { IS_TEST_BUILD } from "@/config";

export const SERVER_ROOT = path.resolve(__dirname, "..");
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

export function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getPath(
  name: "home" | "sessionData" | "userData" | "logs" | "exe" | "module" | "assets",
): string {
  const home = IS_TEST_BUILD ? PROJECT_ROOT : "/efs";

  switch (name) {
    case "home":
      return home;
    case "logs": {
      return path.join(home, "logs");
    }
    case "userData": {
      return path.join(home, "userData");
    }

    case "sessionData": {
      return path.join(getPath("userData"), "sessionData");
    }

    case "exe":
      return process.execPath;
    case "module":
      return path.dirname(require.main?.filename || process.cwd());
    case "assets":
      return path.join(process.cwd(), "assets");

    default:
      throw new Error(`Unknown path name: ${name}`);
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
