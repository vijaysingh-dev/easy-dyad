import winston from "winston";

// Create Winston logger with electron-log compatible interface
const winstonLogger = winston.createLogger({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, scope, ...meta }) => {
      const scopeStr = scope ? `[${scope}]` : "";
      const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
      return `${timestamp} [${level.toUpperCase()}]${scopeStr} ${message}${metaStr}`;
    })
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    }),
    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
      format: winston.format.json(),
    }),
    new winston.transports.File({
      filename: "logs/combined.log",
      format: winston.format.json(),
    }),
  ],
});

// Create electron-log compatible interface
const createLogger = () => {
  const logger = {
    log: (message: string, ...args: any[]) => winstonLogger.info(message, ...args),
    info: (message: string, ...args: any[]) => winstonLogger.info(message, ...args),
    warn: (message: string, ...args: any[]) => winstonLogger.warn(message, ...args),
    error: (message: string, ...args: any[]) => winstonLogger.error(message, ...args),
    debug: (message: string, ...args: any[]) => winstonLogger.debug(message, ...args),

    // electron-log scope method
    scope: (scopeName: string) => {
      return {
        log: (message: string, ...args: any[]) =>
          winstonLogger.info(message, { scope: scopeName }, ...args),
        info: (message: string, ...args: any[]) =>
          winstonLogger.info(message, { scope: scopeName }, ...args),
        warn: (message: string, ...args: any[]) =>
          winstonLogger.warn(message, { scope: scopeName }, ...args),
        error: (message: string, ...args: any[]) =>
          winstonLogger.error(message, { scope: scopeName }, ...args),
        debug: (message: string, ...args: any[]) =>
          winstonLogger.debug(message, { scope: scopeName }, ...args),
      };
    },
  };

  return logger;
};

const log = createLogger();
export default log;
