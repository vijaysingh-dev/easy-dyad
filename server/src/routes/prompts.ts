import { Router, type Request, type Response } from "express";
import log from "electron-log";
import { db } from "../db";
import { prompts } from "../db/schema";
import { eq } from "drizzle-orm";

const logger = log.scope("prompt_handlers");
const router = Router();

// GET /api/prompts or POST /api/prompts/list -> returns list of prompts
router.get("/", async (_req: Request, res: Response) => {
  try {
    const rows = db.select().from(prompts).all();
    const result = rows.map((r: any) => ({
      id: r.id,
      title: r.title,
      description: r.description ?? null,
      content: r.content,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
    res.json({ ok: true, result });
  } catch (err: any) {
    logger.error("Error listing prompts:", err);
    res.status(500).json({ ok: false, error: String(err?.message ?? err) });
  }
});

router.post("/create", async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const params = Array.isArray(body.args) && body.args.length > 0 ? body.args[0] : body;
    const { title, description, content } = params as { title: string; description?: string | null; content: string };
    if (!title || !content) return res.status(400).json({ ok: false, error: "Title and content are required" });

    const result = db.insert(prompts).values({ title, description: description ?? null, content }).run();
    const id = Number(result.lastInsertRowid);
    const row = db.select().from(prompts).where(eq(prompts.id, id)).get();
    if (!row) return res.status(500).json({ ok: false, error: "Failed to fetch created prompt" });

    res.json({ ok: true, result: { id: row.id, title: row.title, description: row.description ?? null, content: row.content, createdAt: row.createdAt, updatedAt: row.updatedAt } });
  } catch (err: any) {
    logger.error("Error creating prompt:", err);
    res.status(500).json({ ok: false, error: String(err?.message ?? err) });
  }
});

router.post("/update", async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const params = Array.isArray(body.args) && body.args.length > 0 ? body.args[0] : body;
    const { id, title, description, content } = params as { id: number; title: string; description?: string | null; content: string };
    if (!id) return res.status(400).json({ ok: false, error: "Prompt id is required" });
    if (!title || !content) return res.status(400).json({ ok: false, error: "Title and content are required" });
    const now = new Date();
    db.update(prompts).set({ title, description: description ?? null, content, updatedAt: now }).where(eq(prompts.id, id)).run();
    res.json({ ok: true });
  } catch (err: any) {
    logger.error("Error updating prompt:", err);
    res.status(500).json({ ok: false, error: String(err?.message ?? err) });
  }
});

router.post("/delete", async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const id = Array.isArray(body.args) && body.args.length > 0 ? Number(body.args[0]) : Number((body as any).id);
    if (!id) return res.status(400).json({ ok: false, error: "Prompt id is required" });
    db.delete(prompts).where(eq(prompts.id, id)).run();
    res.json({ ok: true });
  } catch (err: any) {
    logger.error("Error deleting prompt:", err);
    res.status(500).json({ ok: false, error: String(err?.message ?? err) });
  }
});

export default router;
