import { Router, type Request, type Response } from "express";
import { EventEmitter } from "events";

const router = Router();

type HelpMessage = { role: "user" | "assistant"; content: string };

const helpSessions = new Map<string, HelpMessage[]>();
const activeEmitters = new Map<string, EventEmitter>();

// POST /api/help/chat/start { sessionId, message }
router.post("/chat/start", (req: Request, res: Response) => {
  const { sessionId, message } = req.body ?? {};
  if (!sessionId || !message) return res.status(400).json({ error: "sessionId and message required" });

  // Reset any existing session
  activeEmitters.forEach((em, id) => {
    em.emit("abort");
    activeEmitters.delete(id);
    helpSessions.delete(id);
  });

  const history = helpSessions.get(sessionId) ?? [];
  const updated: HelpMessage[] = [...history, { role: "user" as const, content: String(message) }];
  helpSessions.set(sessionId, updated);

  // In the electron handlers the response streams back; here we simulate an async reply
  const emitter = new EventEmitter();
  activeEmitters.set(sessionId, emitter);

  // Simulate assistant response (quick echo)
  setImmediate(() => {
    if (!activeEmitters.has(sessionId)) return;
  const assistant = `Echo: ${String(message)}`;
  const final: HelpMessage[] = [...updated, { role: "assistant" as const, content: assistant }];
    helpSessions.set(sessionId, final);
    emitter.emit("end", assistant);
    activeEmitters.delete(sessionId);
  });

  res.json({ ok: true });
});

// POST /api/help/chat/cancel { sessionId }
router.post("/chat/cancel", (req: Request, res: Response) => {
  const { sessionId } = req.body ?? {};
  if (!sessionId) return res.status(400).json({ error: "sessionId required" });
  const emitter = activeEmitters.get(sessionId);
  if (emitter) {
    emitter.emit("abort");
    activeEmitters.delete(sessionId);
  }
  helpSessions.delete(sessionId);
  res.json({ ok: true });
});

export default router;
