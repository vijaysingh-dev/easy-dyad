import { NODE_ENV, PORT, ALLOWED_ORIGINS } from "@/config";

import logger from "./logger";
import { initializeDatabase } from "@/db";
import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import morgan from "morgan";
import appRoutes from "./routes/app.route";
import chatRoutes from "./routes/chat.route";
import integrationRoutes from "./routes/integration.route";
import mcpRoutes from "./routes/mcp.route";
import llmRoutes from "./routes/llm.route";
import settingsRoutes from "./routes/settings.route";
import versionRoutes from "./routes/version.route";

import { requestLogger } from "./middleware/requestLogger";
import { runningApps } from "./utils/process_manager";
import { stopRunningApp } from "./utils/app_utils";

initializeDatabase();

const app = express();

const allowedOrigins = ALLOWED_ORIGINS?.split(",")?.filter(Boolean) ?? [];
logger.info(
  `Allowed origins: ${
    allowedOrigins.length > 0 ? allowedOrigins.join(", ") : "All origins allowed"
  }`
);
app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : "*",
    credentials: true,
  })
);
app.disable("etag");
app.use(express.json({ limit: "10mb" }));
app.use(morgan(NODE_ENV === "production" ? "combined" : "dev"));

app.use(requestLogger);

// API Routes
app.use("/api/app", appRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/integration", integrationRoutes);
app.use("/api/mcp", mcpRoutes);
app.use("/api/llm", llmRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/version", versionRoutes);

// Error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = typeof err?.status === "number" ? err.status : 500;
  res.status(status).json({ error: err?.message ?? "Internal Server Error" });
});

const server = app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${PORT}`);
});

async function shutdown() {
  console.log("\nGracefully shutting down...");
  try {
    for (const appId of runningApps.keys())
      try {
        stopRunningApp(appId);
      } catch (err) {
        console.error(err);
      }

    server.close(() => {
      console.log("Express server closed.");
      process.exit(0);
    });

    setTimeout(() => {
      console.warn("Force exiting...");
      process.exit(1);
    }, 5000);
  } catch (err) {
    console.error("Error during shutdown:", err);
    process.exit(1);
  }
}

// Catch Ctrl+C and termination signals
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
