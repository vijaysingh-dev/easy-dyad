import morgan from "morgan";
import { accessLogger } from "@/logger";

morgan.token("statusColored", (req, res) => {
  const status = res.statusCode;

  if (status >= 500) return `\x1b[31m${status}\x1b[0m`; // red
  if (status >= 400) return `\x1b[33m${status}\x1b[0m`; // yellow
  if (status >= 300) return `\x1b[36m${status}\x1b[0m`; // cyan
  return `\x1b[32m${status}\x1b[0m`; // green
});

export const requestLogger = morgan(
  ":method :url :statusColored :response-time ms - :res[content-length]",
  {
    stream: {
      write: (message) => accessLogger.info(message.trim()),
    },
  }
);
