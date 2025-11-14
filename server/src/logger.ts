import winston from "winston";
import fs from "fs";
import path from "path";
import { SERVER_ROOT, getPath } from "@/shared/paths";

const LOG_DIR = getPath("logs");
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const CURRENT_FILE = __filename.replace(/\\/g, "/");

function getCaller(): string | undefined {
  const stack = new Error().stack?.split("\n") ?? [];

  const callerLine = stack.find((line) => {
    if (!line.includes("at ")) return false;
    if (line.includes("Error")) return false;
    return !line.includes(CURRENT_FILE);
  });

  if (!callerLine) return undefined;

  const match =
    callerLine.match(/\((.*):(\d+):(\d+)\)/) ||
    callerLine.match(/at (.*):(\d+):(\d+)\b/);

  if (!match) return undefined;

  const absoluteFile = match[1].replace(/\\/g, "/");
  const rel = path.relative(SERVER_ROOT, absoluteFile).replace(/\\/g, "/");

  return `server/${rel}:${match[2]}`;
}

const formatMsg = (msg: any, args: any[]) =>
  [msg, ...args]
    .map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x)))
    .join(" ");

const winstonLogger = winston.createLogger({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }),
    winston.format.printf(({ level, timestamp, message, caller }) => {
      const lvl = level.toUpperCase().padEnd(5);
      const fileStr = caller ? `${caller} - ` : "";
      return `${lvl} ${timestamp} | ${fileStr}${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: path.join(LOG_DIR, "combined.log"),
      level: "info",
      maxsize: 5 * 1024 * 1024,
      maxFiles: 10,
      tailable: true,
      zippedArchive: true,
    }),
    new winston.transports.File({
      filename: path.join(LOG_DIR, "error.log"),
      level: "error",
      maxsize: 5 * 1024 * 1024,
      maxFiles: 10,
      tailable: true,
      zippedArchive: true,
    }),
  ],
});

const logger = {
  log: (msg: any, ...args: any[]) =>
    winstonLogger.info(formatMsg(msg, args), { caller: getCaller() }),
  info: (msg: any, ...args: any[]) =>
    winstonLogger.info(formatMsg(msg, args), { caller: getCaller() }),
  warn: (msg: any, ...args: any[]) =>
    winstonLogger.warn(formatMsg(msg, args), { caller: getCaller() }),
  error: (msg: any, ...args: any[]) =>
    winstonLogger.error(formatMsg(msg, args), { caller: getCaller() }),
  debug: (msg: any, ...args: any[]) =>
    winstonLogger.debug(formatMsg(msg, args), { caller: getCaller() }),
  transports: winstonLogger.transports,
};

export default logger;
