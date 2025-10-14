import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { apps, chats } from "../db/schema";
import { eq } from "drizzle-orm";

const router = Router();

// POST /api/common/chats - create chat for an app
router.post("/chats", async (req: Request, res: Response) => {
  const { appId } = req.body ?? {};
  if (typeof appId !== "number") return res.status(400).json({ error: "appId number required" });
  try {
    const app = await db.query.apps.findFirst({ where: eq(apps.id, appId), columns: { path: true } });
    if (!app) return res.status(404).json({ error: "App not found" });
    const [chat] = await db.insert(chats).values({ appId }).returning();
    res.status(201).json(chat);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
