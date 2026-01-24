import settings from "@/config";

import logger from "@/logger";
// Log all configuration on startup
logger.info(`Configuration:
  NODE_ENV: ${settings.NODE_ENV}
  PORT: ${settings.PORT}
  IS_TEST_BUILD: ${settings.IS_TEST_BUILD}
`);

import { initializeDatabase } from "@/db";
import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import appRoutes from "./routes/app.route";
import chatRoutes from "./routes/chat.route";
import integrationRoutes from "./routes/integration.route";
import mcpRoutes from "./routes/mcp.route";
import llmRoutes from "./routes/llm.route";
import settingsRoutes from "./routes/settings.route";
import versionRoutes from "./routes/version.route";

import { requestLogger } from "./middlewares/requestLogger";
import { runningApps, stopRunningApp } from "./utils/app_utils";

initializeDatabase();

const app = express();

const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",").filter(Boolean) ?? [];
logger.info("Allowed origins:", allowedOrigins);
app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : "*",
    credentials: true,
  }),
);
app.disable("etag");
app.use(express.json({ limit: "10mb" }));

app.use(requestLogger);

app.get("/health", (_, res) => {
  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: Date.now(),
  });
});

// API Routes
app.use("/app", appRoutes);
app.use("/chat", chatRoutes);
app.use("/integration", integrationRoutes);
app.use("/mcp", mcpRoutes);
app.use("/llm", llmRoutes);
app.use("/settings", settingsRoutes);
app.use("/version", versionRoutes);

// Error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = typeof err?.status === "number" ? err.status : 500;
  res.status(status).json({ error: err?.message ?? "Internal Server Error" });
});

const server = app.listen(settings.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${settings.PORT}`);
});

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`\nReceived ${signal}. Starting graceful shutdown...`);

  const killer = setTimeout(() => {
    console.error("Shutdown taking too long. Forcing exit.");
    process.exit(1);
  }, 20000);

  try {
    for (const appId of Array.from(runningApps.keys())) {
      await stopRunningApp(appId);
    }

    await new Promise((res) => server.close(res));
    console.log("All resources cleaned up.");
  } catch (e) {
    console.error("Shutdown error:", e);
  } finally {
    clearTimeout(killer);
    process.exit(0);
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("SIGQUIT", shutdown);
