import os from "node:os";
import fs from "fs";
import path from "node:path";
import settings from "@/config";

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
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getPath(
  name:
    | "home"
    | "logs"
    | "userData"
    | "appBase"
    | "easyApp"
    | "temp"
    | "sessionData"
    | "typeScriptCache"
    | "exe"
    | "module"
    | "assets",
): string {
  const home = os.homedir();

  switch (name) {
    case "home":
      return home;
    case "logs":
      return path.join(settings.IS_TEST_BUILD ? PROJECT_ROOT : home, "logs");
    case "userData":
      return settings.IS_TEST_BUILD ? path.join(PROJECT_ROOT, "userData") : "/efs";
    case "appBase":
      return path.join(getPath("userData"), "easy-apps");

    case "temp":
      return path.join(getPath("userData"), "temp");
    case "sessionData":
      return path.join(getPath("userData"), "sessionData");
    case "typeScriptCache":
      return path.join(getPath("sessionData"), "typescript-cache");

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

export function getEasyAppPath(appPath: string): string {
  return path.join(getPath("appBase"), appPath);
}
