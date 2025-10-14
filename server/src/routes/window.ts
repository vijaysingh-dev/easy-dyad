import { Router, type Request, type Response } from "express";

const router = Router();

// These window controls don't have a server equivalent. Provide stubs so the
// client can call the same APIs when connected to an HTTP backend.

router.post("/minimize", (_req: Request, res: Response) => res.json({ ok: true }));
router.post("/maximize", (_req: Request, res: Response) => res.json({ ok: true }));
router.post("/close", (_req: Request, res: Response) => res.json({ ok: true }));
router.get("/platform", (_req: Request, res: Response) => res.json({ ok: true, result: process.platform }));

export default router;
