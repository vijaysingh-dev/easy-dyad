import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import appRoutes from "./routes/app";
import chatRoutes from "./routes/chat";
import integrationRoutes from "./routes/integration";
import mcpRoutes from "./routes/mcp";
import miscRoutes from "./routes/misc";
import settingsRoutes from "./routes/settings";
import versionRoutes from "./routes/version";

dotenv.config();

const app = express();

// API Routes
app.use("/api/app", appRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/integration", integrationRoutes);
app.use("/api/mcp", mcpRoutes);
app.use("/api/misc", miscRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/version", versionRoutes);

app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") ?? true }));
app.use(express.json({ limit: "10mb" }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// Error handler
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = typeof err?.status === "number" ? err.status : 500;
  res.status(status).json({ error: err?.message ?? "Internal Server Error" });
});

const port = Number(process.env.PORT ?? 8000);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${port}`);
});
