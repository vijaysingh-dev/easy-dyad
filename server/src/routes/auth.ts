import { Router } from "express";
import tokenRouter from "./token";
import { eq } from "drizzle-orm";
import { constructSystemPrompt, readAiRules } from "../prompts/system_prompt";
import { SUPABASE_AVAILABLE_SYSTEM_PROMPT, SUPABASE_NOT_AVAILABLE_SYSTEM_PROMPT } from "../prompts/supabase_prompt";
import { getDyadAppPath } from "../paths/paths";
import { estimateTokens, getContextWindow } from "../utils/token_utils";
import { extractCodebase } from "../utils/codebase";
import { getSupabaseContext } from "../supabase_admin/supabase_context";
import { validateChatContext } from "../utils/context_paths_utils";
import { extractMentionedAppsCodebases } from "../utils/mention_apps";
import { parseAppMentions } from "../../shared/parse_mention_apps";

import fs from "node:fs/promises";
import { getTypeScriptCachePath } from "../paths/paths";

const router = Router();

// POST /api/token/chat-count
router.post("/chat-count", async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const reqPayload = Array.isArray(body.args) && body.args.length > 0 ? body.args[0] : body;
    const chatId = Number(reqPayload.chatId);
    const input = String(reqPayload.input ?? "");
    if (!chatId) return res.status(400).json({ ok: false, error: "chatId is required" });

    const chat = await db.query.chats.findFirst({ where: eq(chats.id, chatId), with: { messages: true, app: true } });
    if (!chat) return res.status(404).json({ ok: false, error: `Chat not found: ${chatId}` });

    const messageHistory = chat.messages.map((m) => m.content).join("");
    const messageHistoryTokens = estimateTokens(messageHistory);
    const inputTokens = estimateTokens(input);

    let systemPrompt = constructSystemPrompt({ aiRules: await readAiRules(getDyadAppPath(chat.app.path)), chatMode: "default" });
    let supabaseContext = "";
    if (chat.app?.supabaseProjectId) {
      systemPrompt += "\n\n" + SUPABASE_AVAILABLE_SYSTEM_PROMPT;
      supabaseContext = await getSupabaseContext({ supabaseProjectId: chat.app.supabaseProjectId });
    } else if (!chat.app?.neonProjectId) {
      systemPrompt += "\n\n" + SUPABASE_NOT_AVAILABLE_SYSTEM_PROMPT;
    }

    const systemPromptTokens = estimateTokens(systemPrompt + supabaseContext);

    let codebaseTokens = 0;
    if (chat.app) {
      const appPath = getDyadAppPath(chat.app.path);
      const { formattedOutput, files } = await extractCodebase({ appPath, chatContext: validateChatContext(chat.app.chatContext) });
      codebaseTokens = estimateTokens(formattedOutput);
    }

    const mentionedAppNames = parseAppMentions(input);
    const mentionedAppsCodebases = await extractMentionedAppsCodebases(mentionedAppNames, chat.app?.id);
    let mentionedAppsTokens = 0;
    if (mentionedAppsCodebases.length > 0) {
      const mentionedAppsContent = mentionedAppsCodebases.map(({ appName, codebaseInfo }) => `\n\n=== Referenced App: ${appName} ===\n${codebaseInfo}`).join("");
      mentionedAppsTokens = estimateTokens(mentionedAppsContent);
    }

    const totalTokens = messageHistoryTokens + inputTokens + systemPromptTokens + codebaseTokens + mentionedAppsTokens;

    res.json({ ok: true, result: { totalTokens, messageHistoryTokens, codebaseTokens, mentionedAppsTokens, inputTokens, systemPromptTokens, contextWindow: await getContextWindow() } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message ?? String(err) });
  }
});
// POST /api/session/clear-session-data
router.post("/clear-session-data", async (_req: Request, res: Response) => {
  try {
    // In the Electron app this cleared session storage and cookies. On server
    // side we can't clear browser storage, so we perform any server-side cache cleanup.
    try {
      await fs.rm(getTypeScriptCachePath(), { recursive: true, force: true });
    } catch (e) {
      // ignore
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: String(err?.message ?? err) });
  }
});
// Mount token and session under /auth/token and /auth/session
router.use("/token", tokenRouter);
router.use("/session", sessionRouter);

export default router;
