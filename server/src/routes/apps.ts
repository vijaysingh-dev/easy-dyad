import { Router, type Request, type Response } from "express";
import { z } from "zod";

type AppItem = { id: number; name: string; path: string };

// Simple in-memory store for now. Replace with real DB integration.
const apps: AppItem[] = [];
let nextAppId = 1;

const renameSchema = z.object({ appName: z.string().min(1), appPath: z.string().min(1) });
const copySchema = z.object({ newAppName: z.string().min(1), withHistory: z.boolean().optional() });
const createSchema = z.object({ name: z.string().min(1) });

export const appsRouter = Router();

// List apps
appsRouter.get("/", (_req: Request, res: Response) => {
  res.json({ apps, appBasePath: "$APP_BASE_PATH" });
});

// Create app (placeholder)
appsRouter.post("/", (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const exists = apps.some((a) => a.name === parsed.data.name);
  if (exists) return res.status(409).json({ error: "App already exists" });
  const app: AppItem = { id: nextAppId++, name: parsed.data.name, path: parsed.data.name };
  apps.push(app);
  res.status(201).json({ app });
});

// Get app by id
appsRouter.get("/:appId", (req: Request, res: Response) => {
  const appId = Number(req.params.appId);
  const app = apps.find((a) => a.id === appId);
  if (!app) return res.status(404).json({ error: "Not found" });
  res.json(app);
});

// Delete app
appsRouter.delete("/:appId", (req: Request, res: Response) => {
  const appId = Number(req.params.appId);
  const idx = apps.findIndex((a) => a.id === appId);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  apps.splice(idx, 1);
  res.status(204).send();
});

// Rename app
appsRouter.put("/:appId", (req: Request, res: Response) => {
  const appId = Number(req.params.appId);
  const parsed = renameSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const app = apps.find((a) => a.id === appId);
  if (!app) return res.status(404).json({ error: "Not found" });
  if (apps.some((a) => a.id !== appId && (a.name === parsed.data.appName || a.path === parsed.data.appPath))) {
    return res.status(409).json({ error: "Name or path already exists" });
  }
  app.name = parsed.data.appName;
  app.path = parsed.data.appPath;
  res.json({ app });
});

// Copy app
appsRouter.post("/:appId/copy", (req: Request, res: Response) => {
  const appId = Number(req.params.appId);
  const parsed = copySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const source = apps.find((a) => a.id === appId);
  if (!source) return res.status(404).json({ error: "Not found" });
  if (apps.some((a) => a.name === parsed.data.newAppName)) {
    return res.status(409).json({ error: "App name already exists" });
  }
  const newApp: AppItem = { id: nextAppId++, name: parsed.data.newAppName, path: `${source.path}-copy` };
  apps.push(newApp);
  res.json({ app: newApp });
});


