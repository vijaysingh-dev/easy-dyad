import { NODE_ENV, PORT, ALLOWED_ORIGINS } from "@/config";

import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import morgan from "morgan";
import { initializeDatabase } from "@/db";
import appRoutes from "./routes/app";
import chatRoutes from "./routes/chat";
import integrationRoutes from "./routes/integration";
import mcpRoutes from "./routes/mcp";
import llmRoutes from "./routes/llm";
import settingsRoutes from "./routes/settings";
import versionRoutes from "./routes/version";

initializeDatabase();

const app = express();

const allowedOrigins = ALLOWED_ORIGINS?.split(",")?.filter(Boolean) ?? [];
app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : "*",
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(morgan(NODE_ENV === "production" ? "combined" : "dev"));

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

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${PORT}`);
});
