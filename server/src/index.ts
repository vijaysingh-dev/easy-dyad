import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import apiRouter from "./routes";

dotenv.config();

const app = express();
app.use("/api", apiRouter);

app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") ?? true }));
app.use(express.json({ limit: "10mb" }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// Health route
app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, env: process.env.NODE_ENV ?? "development" });
});

// Version endpoint
app.get("/api/version", (_req: Request, res: Response) => {
  res.json({ version: "0.1.0" });
});

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
