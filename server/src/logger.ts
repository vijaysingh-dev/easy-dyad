import winston from "winston";
import path from "path";
import fs from "fs";

const PROJECT_ROOT = path.resolve("server/src");

const LOG_DIR = path.join(path.resolve(), "..", "logs");
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const winstonLogger = winston.createLogger({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
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
      maxsize: 10 * 1024 * 1024, // 10MB per file
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(LOG_DIR, "error.log"),
      level: "error",
      maxsize: 5 * 1024 * 1024, // 5MB per file
      maxFiles: 5,
    }),
  ],
});

const formatMsg = (msg: any, args: any[]) =>
  [msg, ...args]
    .map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x)))
    .join(" ");

function getCaller(): string | undefined {
  const stack = new Error().stack?.split("\n") || [];
  const callerLine = stack[3] || stack[2] || "";
  const match =
    callerLine.match(/\((.*):(\d+):(\d+)\)$/) || callerLine.match(/at (.*):(\d+):(\d+)/);
  if (!match) return undefined;
  const filePath = match[1];
  const line = match[2];

  let relativePath = path.relative(PROJECT_ROOT, filePath).replace(/\\/g, "/");
  if (relativePath.startsWith("..")) {
    relativePath = relativePath.replace(/^(\.\.\/)+/, "server/");
  } else {
    relativePath = `server/${relativePath}`;
  }
  return `${relativePath}:${line}`;
}

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
