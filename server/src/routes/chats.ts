import { Router, type Request, type Response } from "express";

// Minimal chat router stub; replace with DB-backed implementation.
let nextChatId = 1;

export const chatsRouter = Router();

// Create chat for an app
chatsRouter.post("/:appId/chats", (req: Request, res: Response) => {
  const chatId = nextChatId++;
  res.json({ chatId });
});


