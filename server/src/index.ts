import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import { appsRouter } from "./routes/apps";
import { chatsRouter } from "./routes/chats";

dotenv.config();

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") ?? true }));
app.use(express.json({ limit: "10mb" }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// Health route
app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, env: process.env.NODE_ENV ?? "development" });
});

// Example: version endpoint (placeholder). Replace with real data source.
app.get("/api/version", (_req: Request, res: Response) => {
  res.json({ version: "0.1.0" });
});

// Routers
app.use("/api/apps", appsRouter);
app.use("/api/apps", chatsRouter);

// Error handler
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = typeof err?.status === "number" ? err.status : 500;
  res.status(status).json({ error: err?.message ?? "Internal Server Error" });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${port}`);
});


