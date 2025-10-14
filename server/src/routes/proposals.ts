import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { messages, chats } from "../db/schema";
import { desc, eq, and } from "drizzle-orm";
import path from "node:path"; // Import path for basename
import { processFullResponseActions } from "../processors/response_processor";
import {
  getDyadWriteTags,
  getDyadRenameTags,
  getDyadDeleteTags,
  getDyadExecuteSqlTags,
  getDyadAddDependencyTags,
  getDyadChatSummaryTag,
  getDyadCommandTags,
} from "../utils/dyad_tag_parser";
import log from "electron-log";
import { isServerFunction } from "../../supabase_admin/supabase_utils";
import {
  estimateMessagesTokens,
  estimateTokens,
  getContextWindow,
} from "../utils/token_utils";
import { extractCodebase } from "../../utils/codebase";
import { getDyadAppPath } from "../paths/paths";
import { withLock } from "../utils/lock_utils";
import { validateChatContext } from "../utils/context_paths_utils";
import { readSettings } from "@/main/settings";

const logger = log.scope("proposal_handlers");

// Cache for codebase token counts (kept in-memory, same behaviour as handler)
interface CodebaseTokenCache {
  chatId: number;
  messageId: number;
  messageContent: string;
  tokenCount: number;
  timestamp: number;
  chatContext: string;
}
const CACHE_EXPIRATION_MS = 5 * 60 * 1000;
const codebaseTokenCache = new Map<number, CodebaseTokenCache>();

function cleanupExpiredCacheEntries() {
  const now = Date.now();
  codebaseTokenCache.forEach((entry, key) => {
    if (now - entry.timestamp > CACHE_EXPIRATION_MS) codebaseTokenCache.delete(key);
  });
}

async function getCodebaseTokenCount(
  chatId: number,
  messageId: number,
  messageContent: string,
  appPath: string,
  chatContext: unknown,
): Promise<number> {
  cleanupExpiredCacheEntries();
  const cacheEntry = codebaseTokenCache.get(chatId);
  const now = Date.now();
  if (
    cacheEntry &&
    cacheEntry.messageId === messageId &&
    cacheEntry.messageContent === messageContent &&
    cacheEntry.chatContext === JSON.stringify(chatContext) &&
    now - cacheEntry.timestamp < CACHE_EXPIRATION_MS
  ) {
    logger.log(`Using cached codebase token count for chatId: ${chatId}`);
    return cacheEntry.tokenCount;
  }

  logger.log(`Calculating codebase token count for chatId: ${chatId}`);
  const codebase = (
    await extractCodebase({
      appPath: getDyadAppPath(appPath),
      chatContext: validateChatContext(chatContext),
    })
  ).formattedOutput;
  const tokenCount = estimateTokens(codebase);

  codebaseTokenCache.set(chatId, {
    chatId,
    messageId,
    messageContent,
    tokenCount,
    timestamp: now,
    chatContext: JSON.stringify(chatContext),
  });

  return tokenCount;
}

const router = Router();

// GET or POST /api/proposals/get-proposal -> { chatId }
router.all("/get-proposal", async (req: Request, res: Response) => {
  try {
    const body = req.method === "GET" ? req.query : req.body ?? {};
    const chatId = Array.isArray((body as any).args) ? Number((body as any).args[0]) : Number((body as any).chatId ?? (req.query.chatId as string));
    if (!chatId) return res.status(400).json({ ok: false, error: "chatId is required" });

    const result = await withLock("get-proposal:" + chatId, async () => {
      logger.log(`HTTP: get-proposal called for chatId: ${chatId}`);

      // Find the latest ASSISTANT message for the chat
      const latestAssistantMessage = await db.query.messages.findFirst({
        where: and(eq(messages.chatId, chatId), eq(messages.role, "assistant")),
        orderBy: [desc(messages.createdAt)],
        columns: { id: true, content: true, approvalState: true },
      });

      if (
        latestAssistantMessage?.content &&
        latestAssistantMessage.id &&
        !latestAssistantMessage?.approvalState
      ) {
        const messageId = latestAssistantMessage.id;
        const messageContent = latestAssistantMessage.content;

        const proposalTitle = getDyadChatSummaryTag(messageContent);

        const proposalWriteFiles = getDyadWriteTags(messageContent);
        const proposalRenameFiles = getDyadRenameTags(messageContent);
        const proposalDeleteFiles = getDyadDeleteTags(messageContent);
        const proposalExecuteSqlQueries = getDyadExecuteSqlTags(messageContent);
        const packagesAdded = getDyadAddDependencyTags(messageContent);

        const filesChanged = [
          ...proposalWriteFiles.map((tag) => ({
            name: path.basename(tag.path),
            path: tag.path,
            summary: tag.description ?? "(no change summary found)",
            type: "write" as const,
            isServerFunction: isServerFunction(tag.path),
          })),
          ...proposalRenameFiles.map((tag) => ({
            name: path.basename(tag.to),
            path: tag.to,
            summary: `Rename from ${tag.from} to ${tag.to}`,
            type: "rename" as const,
            isServerFunction: isServerFunction(tag.to),
          })),
          ...proposalDeleteFiles.map((tag) => ({
            name: path.basename(tag),
            path: tag,
            summary: `Delete file`,
            type: "delete" as const,
            isServerFunction: isServerFunction(tag),
          })),
        ];

        if (filesChanged.length > 0 || packagesAdded.length > 0 || proposalExecuteSqlQueries.length > 0) {
          const proposal = {
            type: "code-proposal",
            title: proposalTitle ?? "Proposed File Changes",
            securityRisks: [],
            filesChanged,
            packagesAdded,
            sqlQueries: proposalExecuteSqlQueries.map((query) => ({ content: query.content, description: query.description })),
          };
          logger.log("Generated code proposal.", proposal.title, "files=", proposal.filesChanged.length);

          return { proposal, chatId, messageId };
        }
      }

      const actions: any[] = [];
      if (latestAssistantMessage?.content) {
        const writeTags = getDyadWriteTags(latestAssistantMessage.content);
        const refactorTarget = writeTags.reduce((largest, tag) => {
          const lineCount = tag.content.split("\n").length;
          return lineCount > 500 && (!largest || lineCount > largest.lineCount) ? { path: tag.path, lineCount } : largest;
        }, null as { path: string; lineCount: number } | null);
        if (refactorTarget) actions.push({ id: "refactor-file", path: refactorTarget.path });
        if (writeTags.length === 0 && latestAssistantMessage.content.includes("```")) actions.push({ id: "write-code-properly" });

        const commandTags = getDyadCommandTags(latestAssistantMessage.content);
        if (commandTags.includes("rebuild")) actions.push({ id: "rebuild" });
        if (commandTags.includes("restart")) actions.push({ id: "restart" });
        if (commandTags.includes("refresh")) actions.push({ id: "refresh" });
      }

      // Get all chat messages to calculate token usage
      const chat = await db.query.chats.findFirst({
        where: eq(chats.id, chatId),
        with: { app: true, messages: { orderBy: (messages) => [desc(messages.createdAt)].map((m:any)=>m) } as any },
      });

      if (latestAssistantMessage && chat) {
        const messagesTokenCount = estimateMessagesTokens(chat.messages);
        const codebaseTokenCount = await getCodebaseTokenCount(
          chatId,
          latestAssistantMessage.id,
          latestAssistantMessage.content || "",
          chat.app.path,
          chat.app.chatContext,
        );

        const totalTokens = messagesTokenCount + codebaseTokenCount;
        const contextWindow = Math.min(await getContextWindow(), 100_000);
        logger.log(`Token usage: ${totalTokens}/${contextWindow}`);

        if (totalTokens > contextWindow * 0.8 || chat.messages.length > 10) {
          actions.push({ id: "summarize-in-new-chat" });
        }
      }

      if (latestAssistantMessage) {
        actions.push({ id: "keep-going" });
        return { proposal: { type: "action-proposal", actions }, chatId, messageId: latestAssistantMessage.id };
      }
      return null;
    });

    res.json({ ok: true, result });
  } catch (error: any) {
    logger.error("Error in get-proposal route:", error);
    res.status(500).json({ ok: false, error: String(error?.message ?? error) });
  }
});

// POST /api/proposals/approve-proposal -> { chatId, messageId }
router.post("/approve-proposal", async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const payload = Array.isArray(body.args) && body.args.length > 0 ? body.args[0] : body;
    const chatId = Number(payload.chatId);
    const messageId = Number(payload.messageId);
    if (!chatId || !messageId) return res.status(400).json({ ok: false, error: "chatId and messageId are required" });

    const settings = readSettings();
    if (settings.selectedChatMode === "ask") {
      return res.status(400).json({ ok: false, error: "Ask mode is not supported for proposal approval. Please switch to build mode." });
    }

    // Fetch the specific assistant message
    const messageToApprove = await db.query.messages.findFirst({
      where: and(eq(messages.id, messageId), eq(messages.chatId, chatId), eq(messages.role, "assistant")),
      columns: { content: true },
    });

    if (!messageToApprove?.content) {
      return res.status(404).json({ ok: false, error: `Assistant message not found for chatId: ${chatId}, messageId: ${messageId}` });
    }

    const processResult = await processFullResponseActions(messageToApprove.content, chatId, {
      chatSummary: getDyadChatSummaryTag(messageToApprove.content) ?? undefined,
      messageId,
    });

    if (processResult.error) {
      return res.status(500).json({ ok: false, error: `Error processing actions for message ${messageId}: ${processResult.error}` });
    }

    res.json({ ok: true, result: { extraFiles: processResult.extraFiles, extraFilesError: processResult.extraFilesError } });
  } catch (error: any) {
    logger.error("Error in approve-proposal route:", error);
    res.status(500).json({ ok: false, error: String(error?.message ?? error) });
  }
});

// POST /api/proposals/reject-proposal -> { chatId, messageId }
router.post("/reject-proposal", async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const payload = Array.isArray(body.args) && body.args.length > 0 ? body.args[0] : body;
    const chatId = Number(payload.chatId);
    const messageId = Number(payload.messageId);
    if (!chatId || !messageId) return res.status(400).json({ ok: false, error: "chatId and messageId are required" });

    const messageToReject = await db.query.messages.findFirst({
      where: and(eq(messages.id, messageId), eq(messages.chatId, chatId), eq(messages.role, "assistant")),
      columns: { id: true },
    });

    if (!messageToReject) return res.status(404).json({ ok: false, error: `Assistant message not found for chatId: ${chatId}, messageId: ${messageId}` });

    await db.update(messages).set({ approvalState: "rejected" }).where(eq(messages.id, messageId));

    logger.log(`Message ${messageId} marked as rejected.`);
    res.json({ ok: true });
  } catch (error: any) {
    logger.error("Error in reject-proposal route:", error);
    res.status(500).json({ ok: false, error: String(error?.message ?? error) });
  }
});

export default router;
