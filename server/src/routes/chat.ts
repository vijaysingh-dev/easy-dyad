import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { apps, chats, messages } from "../db/schema";
import { desc, eq, and, like } from "drizzle-orm";
import * as git from "isomorphic-git";
import * as fs from "fs";
import { getTestResponse, streamTestResponse } from "../handlers/testing_chat_handlers";
import { getModelClient } from "../utils/get_model_client";
import { streamText, type ModelMessage, type TextStreamPart, stepCountIs, hasToolCall, ToolSet } from "ai";
import { constructSystemPrompt, readAiRules } from "../prompts/system_prompt";
import { SUPABASE_AVAILABLE_SYSTEM_PROMPT, SUPABASE_NOT_AVAILABLE_SYSTEM_PROMPT } from "../prompts/supabase_prompt";
import { extractCodebase, readFileWithCache } from "../utils/codebase";
import { processFullResponseActions } from "../processors/response_processor";
import { getSupabaseContext, getSupabaseClientCode } from "../supabase_admin/supabase_context";
import { SUMMARIZE_CHAT_SYSTEM_PROMPT } from "../prompts/summarize_chat_system_prompt";
import fs from "node:fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import { readFile, writeFile, unlink } from "fs/promises";
import { getMaxTokens, getTemperature } from "../utils/token_utils";
// Fallback if shared constant is not available during quick port
const MAX_CHAT_TURNS_IN_CONTEXT = 10;
import { validateChatContext } from "../utils/context_paths_utils";
import { getDyadAddDependencyTags, getDyadWriteTags, getDyadDeleteTags, getDyadRenameTags } from "../utils/dyad_tag_parser";
import { fileExists } from "../utils/file_utils";
import { FileUploadsState } from "../utils/file_uploads_state";
import { extractMentionedAppsCodebases } from "../utils/mention_apps";
import { parseAppMentions } from "../../shared/parse_mention_apps";
import { prompts as promptsTable } from "../db/schema";
import { inArray } from "drizzle-orm";
import { replacePromptReference } from "../utils/replacePromptReference";
import { mcpManager } from "../utils/mcp_manager";
import z from "zod";
import { AsyncVirtualFileSystem } from "../../shared/VirtualFilesystem";
import { readSettings } from "../main/settings";
import { createProblemFixPrompt } from "../../shared/problem_prompt";

function createCodebasePrompt(codebaseInfo: string): string {
  return `This is my codebase. ${codebaseInfo}`;
}

// Helper: obtain an async iterable stream from model client or streamText
async function obtainStream(modelClientAny: any, options: any): Promise<AsyncIterable<any>> {
  // Try modelClient.streamText if available
  try {
    if (modelClientAny && typeof modelClientAny.streamText === "function") {
      return (modelClientAny.streamText(options) as unknown) as AsyncIterable<any>;
    }
  } catch (e) {
    // ignore
  }

  // Fallback to calling library-level streamText with provided model
  try {
    const maybe = streamText({ ...(options || {}), model: modelClientAny?.model });
    // If the library returns an object with fullStream, use it
    if (maybe && typeof maybe === "object" && (maybe as any).fullStream) return (maybe as any).fullStream;
    return (maybe as unknown) as AsyncIterable<any>;
  } catch (e) {
    throw e;
  }
}
import { generateProblemReport } from "../processors/tsc";

// Active SSE streams keyed by chatId so they can be cancelled via /cancel
const activeSseStreams = new Map<number, AbortController>();

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const router = Router();

// create-chat -> POST /api/chat/create-chat
router.post("/create-chat", async (req: Request, res: Response) => {
  // Accept either { args: [appId] } or { appId }
  const body = req.body ?? {};
  const appId = Array.isArray(body.args) && body.args.length > 0 ? Number(body.args[0]) : Number(body.appId);
  if (!appId) return res.status(400).json({ ok: false, error: "appId is required" });

  // Get the app's path first
  const app = await db.query.apps.findFirst({
    where: eq(apps.id, appId),
    columns: { path: true },
  });
  if (!app) return res.status(404).json({ ok: false, error: "App not found" });

  let initialCommitHash: string | null = null;
  try {
    initialCommitHash = await git.resolveRef({ fs: fs as any, dir: getDyadAppPath(app.path), ref: "main" });
  } catch (error) {
    // ignore
  }

  const [chat] = await db.insert(chats).values({ appId, initialCommitHash }).returning();
  res.json({ ok: true, result: chat.id });
});

// get-chat -> GET /api/chat/get-chat?chatId=123 or POST with { args: [chatId] }
router.all("/get-chat", async (req: Request, res: Response) => {
  const body = req.method === "GET" ? req.query : req.body ?? {};
  const chatId = Array.isArray((body as any).args) ? Number((body as any).args[0]) : Number((body as any).chatId ?? (req.query.chatId as string));
  if (!chatId) return res.status(400).json({ ok: false, error: "chatId is required" });

  const chat = await db.query.chats.findFirst({
    where: eq(chats.id, chatId),
    with: { messages: { orderBy: (messages) => [desc(messages.createdAt)].map((m:any)=>m) } as any },
  });

  if (!chat) return res.status(404).json({ ok: false, error: "Chat not found" });
  res.json({ ok: true, result: chat });
});

// get-chats -> GET /api/chat/get-chats?appId=... or POST
router.all("/get-chats", async (req: Request, res: Response) => {
  const body = req.method === "GET" ? req.query : req.body ?? {};
  const appId = Array.isArray((body as any).args) && (body as any).args.length > 0 ? Number((body as any).args[0]) : Number((body as any).appId ?? (req.query.appId as string));

  const query = appId
    ? db.query.chats.findMany({
        where: eq(chats.appId, appId),
        columns: { id: true, title: true, createdAt: true, appId: true },
        orderBy: [desc(chats.createdAt)],
      })
    : db.query.chats.findMany({
        columns: { id: true, title: true, createdAt: true, appId: true },
        orderBy: [desc(chats.createdAt)],
      });

  const allChats = await query;
  res.json({ ok: true, result: allChats });
});

// delete-chat -> DELETE /api/chat/delete-chat?chatId=... or POST with body
router.delete("/delete-chat", async (req: Request, res: Response) => {
  const body = req.body ?? {};
  const chatId = Array.isArray(body.args) && body.args.length > 0 ? Number(body.args[0]) : Number(body.chatId ?? req.query.chatId);
  if (!chatId) return res.status(400).json({ ok: false, error: "chatId is required" });
  await db.delete(chats).where(eq(chats.id, chatId));
  res.json({ ok: true });
});

// update-chat -> POST /api/chat/update-chat with body { chatId, title }
router.post("/update-chat", async (req: Request, res: Response) => {
  const body = req.body ?? {};
  const payload = Array.isArray(body.args) && body.args.length > 0 ? body.args[0] : body;
  const chatId = Number(payload.chatId);
  const title = payload.title ?? null;
  if (!chatId) return res.status(400).json({ ok: false, error: "chatId is required" });
  await db.update(chats).set({ title }).where(eq(chats.id, chatId));
  res.json({ ok: true });
});

// delete-messages -> DELETE /api/chat/delete-messages?chatId=...
router.delete("/delete-messages", async (req: Request, res: Response) => {
  const body = req.body ?? {};
  const chatId = Array.isArray(body.args) && body.args.length > 0 ? Number(body.args[0]) : Number(body.chatId ?? req.query.chatId);
  if (!chatId) return res.status(400).json({ ok: false, error: "chatId is required" });
  await db.delete(messages).where(eq(messages.chatId, chatId));
  res.json({ ok: true });
});

// search-chats -> GET /api/chat/search-chats?appId=...&q=... or POST
router.all("/search-chats", async (req: Request, res: Response) => {
  const body = req.method === "GET" ? req.query : req.body ?? {};
  const appId = Array.isArray((body as any).args) && (body as any).args.length > 0 ? Number((body as any).args[0]) : Number((body as any).appId ?? (req.query.appId as string));
  const q = (body as any).q ?? (req.query.q as string) ?? (Array.isArray((body as any).args) ? (body as any).args[1] : undefined);
  if (!appId || !q) return res.status(400).json({ ok: false, error: "appId and query are required" });

  const chatTitleMatches = await db
    .select({ id: chats.id, appId: chats.appId, title: chats.title, createdAt: chats.createdAt })
    .from(chats)
    .where(and(eq(chats.appId, appId), like(chats.title, `%${q}%`)))
    .orderBy(desc(chats.createdAt))
    .limit(10);

  const titleResults = chatTitleMatches.map((c) => ({ id: c.id, appId: c.appId, title: c.title, createdAt: c.createdAt, matchedMessageContent: null }));

  const messageResults = await db
    .select({ id: chats.id, appId: chats.appId, title: chats.title, createdAt: chats.createdAt, matchedMessageContent: messages.content })
    .from(messages)
    .innerJoin(chats, eq(messages.chatId, chats.id))
    .where(and(eq(chats.appId, appId), like(messages.content, `%${q}%`)))
    .orderBy(desc(chats.createdAt))
    .limit(10);

  const combined = [...titleResults, ...messageResults];
  const uniqueChats = Array.from(new Map(combined.map((item) => [item.id, item])).values());
  uniqueChats.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json({ ok: true, result: uniqueChats });
});

export default router;

// SSE streaming endpoint: POST /api/chat/stream
router.post("/stream", async (req: Request, res: Response) => {
  const body = req.body ?? {};
  const payload = Array.isArray(body.args) && body.args.length > 0 ? body.args[0] : body;
  const chatId = Number(payload.chatId);
  const prompt = String(payload.prompt ?? payload.promptText ?? "");

  if (!chatId) return res.status(400).json({ ok: false, error: "chatId is required" });

  // Setup SSE headers
  res.writeHead(200, {
    Connection: "keep-alive",
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
  });

  const abortController = new AbortController();
  activeSseStreams.set(chatId, abortController);

  // If this is a test prompt, stream canned response using helper
  const testResponse = getTestResponse(prompt);
  if (testResponse) {
    try {
      const parts = testResponse.split(" ");
      let acc = "";
      for (const w of parts) {
        if (abortController.signal.aborted) break;
        acc += w + " ";
        res.write(`data: ${JSON.stringify({ chatId, chunk: acc.trim() })}\n\n`);
        await sleep(10);
      }
      res.write(`event: end\ndata: ${JSON.stringify({ chatId })}\n\n`);
      res.end();
    } finally {
      activeSseStreams.delete(chatId);
    }
    return;
  }

  // Normal processing
  try {
    // Save attachments (if any) to temp files and prepare attachment info
    const attachmentPaths: string[] = [];
    let attachmentInfo = "";
    const fileUploadsState = FileUploadsState.getInstance();
    if (payload.attachments && Array.isArray(payload.attachments)) {
      for (const [index, attachment] of (payload.attachments as any[]).entries()) {
        const hash = crypto.createHash("md5").update(attachment.name + Date.now()).digest("hex");
        const fileExt = path.extname(attachment.name) || "";
        const filename = `${hash}${fileExt}`;
        const filePath = path.join(os.tmpdir(), "dyad-attachments", filename);
        await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
        const base64 = (attachment.data as string).split(";base64,").pop() || "";
        await writeFile(filePath, Buffer.from(base64, "base64"));
        attachmentPaths.push(filePath);

        if (attachment.attachmentType === "upload-to-codebase") {
          const fileId = `DYAD_ATTACHMENT_${index}`;
          fileUploadsState.addFileUpload({ chatId, fileId }, { filePath, originalName: attachment.name });
          attachmentInfo += `\n\nFile to upload to codebase: ${attachment.name} (file id: ${fileId})\n`;
        } else {
          attachmentInfo += `- ${attachment.name} (${attachment.type})\n`;
        }
      }
    }

    // Inline prompt references like @prompt:<id>
    let userPrompt = prompt + (attachmentInfo ? "\n\nAttachments:\n" + attachmentInfo : "");
    const promptMatches = Array.from(userPrompt.matchAll(/@prompt:(\d+)/g));
    if (promptMatches.length > 0) {
      const ids = Array.from(new Set(promptMatches.map((m) => Number(m[1]))));
      const referenced = await db.select().from(promptsTable).where(inArray(promptsTable.id, ids));
      if (referenced.length > 0) {
        const promptsMap: Record<number, string> = {};
        for (const p of referenced) promptsMap[p.id] = p.content;
        userPrompt = replacePromptReference(userPrompt, promptsMap);
      }
    }

    // If selectedComponent provided, try to include a small snippet
    if (payload.selectedComponent && payload.selectedComponent.relativePath) {
      try {
        const chat = await db.query.chats.findFirst({ where: eq(chats.id, chatId), with: { app: true } as any });
        if (chat?.app) {
          const componentPath = path.join(getDyadAppPath(chat.app.path), payload.selectedComponent.relativePath);
          const content = await readFile(componentPath, "utf-8");
          const lines = content.split("\n");
          const idx = Math.max(0, (payload.selectedComponent.lineNumber || 1) - 1);
          const snippet = lines.slice(Math.max(0, idx - 1), Math.min(lines.length, idx + 4)).join("\n");
          userPrompt += `\n\nSelected component: ${payload.selectedComponent.name} (file: ${payload.selectedComponent.relativePath})\n\nSnippet:\n\`\`\`\n${snippet}\n\`\`\`\n`;
        }
      } catch (e) {
        // ignore
      }
    }

    // Insert user message and placeholder assistant message
    await db.insert(messages).values({ chatId, role: "user", content: userPrompt }).returning();
    const [placeholderAssistantMessage] = await db.insert(messages).values({ chatId, role: "assistant", content: "" }).returning();

    // Fetch latest chat with messages and app info
    const updatedChat = await db.query.chats.findFirst({ where: eq(chats.id, chatId), with: { messages: { orderBy: (m:any)=>[desc(messages.createdAt)].map((x:any)=>x) } as any, app: true } as any });
    if (!updatedChat) throw new Error(`Chat not found: ${chatId}`);

    // Send initial messages to client so UI shows loading state
    res.write(`data: ${JSON.stringify({ chatId, messages: updatedChat.messages })}\n\n`);

    // Build system prompt and context
    const settings = readSettings();
    const appPath = getDyadAppPath(updatedChat.app.path);
    const chatContext = payload.selectedComponent
      ? { contextPaths: [{ globPath: payload.selectedComponent.relativePath }], smartContextAutoIncludes: [] }
      : validateChatContext(updatedChat.app.chatContext);

    const mentionedAppNames = parseAppMentions(prompt);
    const { formattedOutput: codebaseInfo, files } = await extractCodebase({ appPath, chatContext });
    const mentionedAppsCodebases = await extractMentionedAppsCodebases(mentionedAppNames, updatedChat.app.id);
    let otherAppsCodebaseInfo = "";
    if (mentionedAppsCodebases.length > 0) {
      otherAppsCodebaseInfo = mentionedAppsCodebases.map(({ appName, codebaseInfo }) => `\n\n=== Referenced App: ${appName} ===\n${codebaseInfo}`).join("");
    }

    let systemPrompt = constructSystemPrompt({ aiRules: await readAiRules(getDyadAppPath(updatedChat.app.path)), chatMode: settings.selectedChatMode === "agent" ? "build" : settings.selectedChatMode });
    if (otherAppsCodebaseInfo) {
      const mentionedAppsList = mentionedAppsCodebases.map((c) => c.appName).join(", ");
      systemPrompt += `\n\n# Referenced Apps\nThe user has mentioned the following apps in their prompt: ${mentionedAppsList}. Their codebases have been included in the context for your reference.`;
    }
    if (updatedChat.app?.supabaseProjectId && settings.supabase?.accessToken?.value) {
      systemPrompt += "\n\n" + SUPABASE_AVAILABLE_SYSTEM_PROMPT + "\n\n" + (await getSupabaseContext({ supabaseProjectId: updatedChat.app.supabaseProjectId }));
    } else if (!updatedChat.app?.neonProjectId) {
      systemPrompt += "\n\n" + SUPABASE_NOT_AVAILABLE_SYSTEM_PROMPT;
    }
    if (prompt.startsWith("Summarize from chat-id=")) systemPrompt = SUMMARIZE_CHAT_SYSTEM_PROMPT;

    // Prepare message history
    const messageHistory = updatedChat.messages.map((m: any) => ({ role: m.role, content: m.content } as ModelMessage));
    const maxChatTurns = (settings.maxChatTurnsInContext || MAX_CHAT_TURNS_IN_CONTEXT) + 1;
    let limitedHistory = messageHistory;
    if (messageHistory.length > maxChatTurns * 2) {
      limitedHistory = messageHistory.filter((m) => m.role !== "system").slice(-maxChatTurns * 2);
    }

    // If codebase should be included and engine isn't enabled, prefix messages
    const { modelClient } = await getModelClient(settings.selectedModel, settings, files as any);
    const codebasePrefix = [] as ModelMessage[];
    if (modelClient) {
      codebasePrefix.push({ role: "user", content: createCodebasePrompt(codebaseInfo) } as ModelMessage);
      codebasePrefix.push({ role: "assistant", content: "OK, got it. I'm ready to help" } as ModelMessage);
    }

    const chatMessages: ModelMessage[] = [
      ...codebasePrefix,
      ...limitedHistory,
      { role: "user", content: userPrompt },
    ];

    // Stream via model client using streamText
    const stream = streamText({
      model: modelClient.model,
      maxOutputTokens: await getMaxTokens(settings.selectedModel),
      temperature: await getTemperature(settings.selectedModel),
      messages: chatMessages.filter((m) => m.content),
      abortSignal: abortController.signal,
    } as any);

    let fullResponse = "";
    let lastDbSaveAt = 0;
    for await (const part of stream as AsyncIterable<any>) {
      if (abortController.signal.aborted) break;
      const chunk = part.type === "text-delta" ? part.text : (part.text ?? JSON.stringify(part));
      fullResponse += chunk;

      // Save partial response occasionally
      const now = Date.now();
      if (now - lastDbSaveAt >= 150) {
        await db.update(messages).set({ content: fullResponse }).where(eq(messages.id, (placeholderAssistantMessage as any).id));
        lastDbSaveAt = now;
      }

      // Emit partial via SSE
      const currentMessages = [...updatedChat.messages];
      if (currentMessages.length > 0 && currentMessages[currentMessages.length - 1].role === "assistant") {
        currentMessages[currentMessages.length - 1].content = fullResponse;
      } else {
        currentMessages.push({ role: "assistant", content: fullResponse });
      }
      res.write(`data: ${JSON.stringify({ chatId, messages: currentMessages, chunk: chunk })}\n\n`);
    }

    if (!abortController.signal.aborted && fullResponse) {
      await db.update(messages).set({ content: fullResponse }).where(eq(messages.id, (placeholderAssistantMessage as any).id));
      // Optionally run processFullResponseActions if auto-approve enabled
      const settings2 = readSettings();
      if (settings2.autoApproveChanges && settings2.selectedChatMode !== "ask") {
        const status = await processFullResponseActions(fullResponse, chatId, { messageId: (placeholderAssistantMessage as any).id });
        // send end with status
        res.write(`event: end\ndata: ${JSON.stringify({ chatId, updatedFiles: status.updatedFiles ?? false, extraFiles: status.extraFiles, extraFilesError: status.extraFilesError })}\n\n`);
      } else {
        res.write(`event: end\ndata: ${JSON.stringify({ chatId, updatedFiles: false })}\n\n`);
      }
    } else {
      res.write(`event: end\ndata: ${JSON.stringify({ chatId, updatedFiles: false })}\n\n`);
    }
    res.end();

    // Schedule temp files for deletion
    if (attachmentPaths.length > 0) {
      for (const fp of attachmentPaths) {
        setTimeout(async () => {
          try {
            if (fs.existsSync(fp)) await unlink(fp);
          } catch {}
        }, 30 * 60 * 1000);
      }
    }

  } catch (error: any) {
    try {
      res.write(`data: ${JSON.stringify({ chatId, chunk: `[error] ${String(error?.message ?? error)}` })}\n\n`);
      res.write(`event: end\ndata: ${JSON.stringify({ chatId, updatedFiles: false })}\n\n`);
      res.end();
    } catch {}
  } finally {
    activeSseStreams.delete(chatId);
  }
});

// Cancel stream: POST /api/chat/cancel with { chatId }
router.post("/cancel", (req: Request, res: Response) => {
  const body = req.body ?? {};
  const chatId = Array.isArray(body.args) && body.args.length > 0 ? Number(body.args[0]) : Number(body.chatId ?? req.query.chatId);
  if (!chatId) return res.status(400).json({ ok: false, error: "chatId is required" });
  const controller = activeSseStreams.get(chatId);
  if (controller) {
    controller.abort();
    // leave deletion to stream handler after it cleans up
    activeSseStreams.delete(chatId);
    res.json({ ok: true });
    return;
  }
  res.json({ ok: true, warning: "No active stream for chatId" });
});

