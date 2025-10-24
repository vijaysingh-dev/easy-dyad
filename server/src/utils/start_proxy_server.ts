// startProxy.js – helper to launch proxy.js as a worker
import logger from "@/logger";
import { Worker } from "worker_threads";
import path from "path";
import { fileURLToPath } from "url";
import { findAvailablePort } from "./port_utils";

export async function startProxy(
  targetOrigin: string,
  opts: {
    // host?: string;
    // port?: number;
    // env?: Record<string, string>;
    onStarted?: (proxyUrl: string) => void;
  } = {}
) {
  if (!/^https?:\/\//.test(targetOrigin))
    throw new Error("startProxy: targetOrigin must be absolute http/https URL");
  const port = await findAvailablePort(50_000, 60_000);
  logger.info("Found available port", port);
  const {
    // host = "localhost",
    // env = {}, // additional env vars to pass to the worker
    onStarted,
  } = opts;

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const proxyServerJS = path.resolve(__dirname, "..", "..", "worker", "proxy_server.js");
  logger.info("Starting proxy worker:", proxyServerJS);
  const worker = new Worker(proxyServerJS, {
    workerData: {
      targetOrigin,
      port,
    },
  });

  worker.on("message", (m) => {
    logger.info("[proxy]", m);
    if (typeof m === "string" && m.startsWith("proxy-server-start url=")) {
      const url = m.substring("proxy-server-start url=".length);
      onStarted?.(url);
    }
  });
  worker.on("error", (e) => logger.error("[proxy] error:", e.message));
  worker.on("exit", (c) => logger.info("[proxy] exit", c));

  return worker; // let the caller keep a handle if desired
}
