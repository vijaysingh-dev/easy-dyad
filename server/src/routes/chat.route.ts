import logger from "@/logger";
import db from "@/db";
import { apps, chats, messages, prompts } from "@/db/schema";
import { eq, and, isNull, desc, like, inArray } from "drizzle-orm";
import { Router } from "express";
import fs from "node:fs";
import * as path from "path";
import * as crypto from "crypto";
import * as git from "isomorphic-git";
import { v4 as uuidv4 } from "uuid";
import { ModelMessage, streamText, Tool, ToolSet, stepCountIs, hasToolCall } from "ai";
import { GoogleGenerativeAIProviderOptions } from "@ai-sdk/google";
import { readFile, writeFile, unlink } from "fs/promises";
import { openai, createOpenAI, OpenAIResponsesProviderOptions } from "@ai-sdk/openai";
import { z } from "zod";

import {
  getSupabaseContext,
  getSupabaseClientCode,
} from "@/services/supabase/supabase_context";
import {
  SUPABASE_AVAILABLE_SYSTEM_PROMPT,
  SUPABASE_NOT_AVAILABLE_SYSTEM_PROMPT,
} from "@/services/prompts/supabase_prompt";
import { isServerFunction } from "@/services/supabase/supabase_utils";
import { constructSystemPrompt, readAiRules } from "@/services/prompts/system_prompt";
import { SUMMARIZE_CHAT_SYSTEM_PROMPT } from "@/services/prompts/summarize_chat_system_prompt";
import { createProblemFixPrompt } from "@/shared/problem_prompt";
import { parseAppMentions } from "@/shared/parse_mention_apps";
import { processFullResponseActions } from "@/services/processors/response_processor";
import { executeAddDependency } from "@/services/processors/executeAddDependency";
import { generateProblemReport } from "@/workers/tsc";
import { getPath, ensureDir, getEeziAppPath } from "@/paths";
import { AsyncVirtualFileSystem } from "@/workers/VirtualFilesystem";
import { readSettings } from "@/shared/settings";

import { withLock } from "@/utils/lock_utils";
import { fileExists } from "@/utils/file_utils";
import { safeSend } from "@/utils/safe_sender";
import { FileUploadsState } from "@/utils/file_uploads_state";
import { extractCodebase, readFileWithCache } from "@/utils/codebase";
import { extractMentionedAppsCodebases } from "@/utils/mention_apps";
import { getModelClient, ModelClient } from "@/utils/get_model_client";
import { getMaxTokens, getTemperature } from "@/utils/token_utils";
import { validateChatContext } from "@/utils/context_paths_utils";
import { getExtraProviderOptions } from "@/utils/thinking_utils";
import { cleanFullResponse } from "@/utils/cleanFullResponse";
import { replacePromptReference } from "@/utils/replacePromptReference";
import {
  getEeziWriteTags,
  getEeziRenameTags,
  getEeziDeleteTags,
  getEeziExecuteSqlTags,
  getEeziAddDependencyTags,
  getEeziChatSummaryTag,
  getEeziCommandTags,
} from "@/utils/eezi_tag_parser";
import {
  isTextFile,
  formatMessagesForSummary,
  createOtherAppsCodebasePrompt,
  removeEeziTags,
  removeNonEssentialTags,
  prepareMessageWithAttachments,
  hasUnclosedEeziWrite,
  escapeXml,
  getMcpTools,
  processStreamChunks,
  getTestResponse,
  streamTestResponse,
} from "@/utils/stream_utils";
import { getCodebaseTokenCount } from "@/utils/chat_utils";
import {
  estimateTokens,
  getContextWindow,
  estimateMessagesTokens,
} from "@/utils/token_utils";
import {
  CodeProposal,
  ActionProposal,
  AppChatContextSchema,
  ContextPathResults,
} from "@/shared/schemas";
import { MAX_CHAT_TURNS_IN_CONTEXT } from "@/shared/constants";
import { ChatStreamParams, ChatResponseEnd } from "@/shared/eeziTypes";

const router = Router();

router.get("/get-chat/:chatId", async (req, res) => {
  try {
    const chatId = parseInt(req.params.chatId);
    const chat = await db.query.chats.findFirst({
      where: eq(chats.id, chatId),
      with: {
        messages: {
          orderBy: (messages, { asc }) => [asc(messages.createdAt)],
        },
      },
    });
    if (!chat) {
      throw new Error("Chat not found");
    }
    res.status(200).json(chat);
  } catch (error: any) {
    logger.error("Error fetching chat:", error.message);
    res.status(500).json({ error: "Failed to fetch chat" });
  }
});

router.get("/get-chats", async (req, res) => {
  // If appId is provided, filter chats for that app
  try {
    const appId = req.query?.appId;
    const query = appId
      ? db.query.chats.findMany({
          where: eq(chats.appId, appId as string),
          columns: {
            id: true,
            title: true,
            createdAt: true,
            appId: true,
          },
          orderBy: [desc(chats.createdAt)],
        })
      : db.query.chats.findMany({
          columns: {
            id: true,
            title: true,
            createdAt: true,
            appId: true,
          },
          orderBy: [desc(chats.createdAt)],
        });

    const allChats = await query;
    // logger.info("Fetched chats:", allChats);
    res.status(200).json(allChats);
  } catch (error: any) {
    logger.error("Error fetching chats:", error?.message);
    res.status(500).json({ error: "Failed to fetch chats" });
  }
});

router.post("/create-chat/", async (req, res) => {
  try {
    const appId = req.body.appId;
    // Get the app's path first
    const app = await db.query.apps.findFirst({
      where: eq(apps.id, appId),
      columns: {
        path: true,
      },
    });

    if (!app) {
      throw new Error("App not found");
    }

    let initialCommitHash = null;
    try {
      // Get the current git revision of main branch
      initialCommitHash = await git.resolveRef({
        fs,
        dir: getEeziAppPath(app.path),
        ref: "main",
      });
    } catch (error: any) {
      logger.error("Error getting git revision:", error.message);
      // Continue without the git revision
    }

    // Create a new chat
    const [chat] = await db
      .insert(chats)
      .values({
        appId,
        initialCommitHash,
      })
      .returning();
    logger.info(
      "Created chat:",
      chat.id,
      "for app:",
      appId,
      "with initial commit hash:",
      initialCommitHash,
    );
    res.status(200).json(chat.id);
  } catch (error: any) {
    logger.error("Error creating chat:", error.message);
    res.status(500).json({ error: "Failed to create chat" });
  }
});

router.delete("/delete-chat/:chatId", async (req, res) => {
  try {
    const chatId = parseInt(req.params.chatId);
    logger.info("Trying to delte chat:", chatId);
    await db.delete(chats).where(eq(chats.id, chatId));
    res.status(200).json({ success: true });
  } catch (error: any) {
    logger.error("Error deleting chat:", error.message);
    res.status(500).json({ error: "Failed to delete chat" });
  }
});

router.patch("/update-chat/:chatId", async (req, res) => {
  try {
    const chatId = parseInt(req.params.chatId);
    const { title } = req.body;
    await db.update(chats).set({ title }).where(eq(chats.id, chatId));
    res.status(200).json({ success: true });
  } catch (error: any) {
    logger.error("Error updating chat:", error.message);
    res.status(500).json({ error: "Failed to update chat" });
  }
});

router.delete("/delete-messages/:chatId", async (req, res) => {
  try {
    const chatId = parseInt(req.params.chatId);
    await db.delete(messages).where(eq(messages.chatId, chatId));
    res.status(200).json({ success: true });
  } catch (error: any) {
    logger.error("Error deleting messages:", error.message);
    res.status(500).json({ error: "Failed to delete messages" });
  }
});

router.post("/search-chats/:appId", async (req, res) => {
  try {
    const appId = req.params.appId;
    const { query } = req.body;
    // 1) Find chats by title and map to ChatSearchResult with no matched message
    const chatTitleMatches = await db
      .select({
        id: chats.id,
        appId: chats.appId,
        title: chats.title,
        createdAt: chats.createdAt,
      })
      .from(chats)
      .where(and(eq(chats.appId, appId), like(chats.title, `%${query}%`)))
      .orderBy(desc(chats.createdAt))
      .limit(10);

    const titleResults = chatTitleMatches.map((c) => ({
      id: c.id,
      appId: c.appId,
      title: c.title,
      createdAt: c.createdAt,
      matchedMessageContent: null,
    }));

    // 2) Find messages that match and join to chats to build one result per message
    const messageResults = await db
      .select({
        id: chats.id,
        appId: chats.appId,
        title: chats.title,
        createdAt: chats.createdAt,
        matchedMessageContent: messages.content,
      })
      .from(messages)
      .innerJoin(chats, eq(messages.chatId, chats.id))
      .where(and(eq(chats.appId, appId), like(messages.content, `%${query}%`)))
      .orderBy(desc(chats.createdAt))
      .limit(10);

    // Combine: keep title matches and per-message matches
    const combined = [...titleResults, ...messageResults];
    const uniqueChats = Array.from(
      new Map(combined.map((item) => [item.id, item])).values(),
    );

    // Sort newest chats first
    uniqueChats.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    res.status(200).json(uniqueChats);
  } catch (error: any) {
    logger.error("Error searching chats:", error.message);
    res.status(500).json({ error: "Failed to search chats" });
  }
});

router.get("/get-context-paths", async (req, res) => {
  try {
    const appId = req.query.appId as string;
    z.object({ appId: z.number() }).parse({ appId });
    const app = await db.query.apps.findFirst({
      where: eq(apps.id, appId),
    });

    if (!app) {
      throw new Error("App not found");
    }

    if (!app.path) {
      throw new Error("App path not set");
    }
    const appPath = getEeziAppPath(app.path);

    const results: ContextPathResults = {
      contextPaths: [],
      smartContextAutoIncludes: [],
      excludePaths: [],
    };
    const { contextPaths, smartContextAutoIncludes, excludePaths } = validateChatContext(
      app.chatContext,
    );
    for (const contextPath of contextPaths) {
      const { formattedOutput, files } = await extractCodebase({
        appPath,
        chatContext: {
          contextPaths: [contextPath],
          smartContextAutoIncludes: [],
        },
      });
      const totalTokens = estimateTokens(formattedOutput);

      results.contextPaths.push({
        ...contextPath,
        files: files.length,
        tokens: totalTokens,
      });
    }

    for (const contextPath of smartContextAutoIncludes) {
      const { formattedOutput, files } = await extractCodebase({
        appPath,
        chatContext: {
          contextPaths: [contextPath],
          smartContextAutoIncludes: [],
        },
      });
      const totalTokens = estimateTokens(formattedOutput);

      results.smartContextAutoIncludes.push({
        ...contextPath,
        files: files.length,
        tokens: totalTokens,
      });
    }

    for (const excludePath of excludePaths || []) {
      const { formattedOutput, files } = await extractCodebase({
        appPath,
        chatContext: {
          contextPaths: [excludePath],
          smartContextAutoIncludes: [],
        },
      });
      const totalTokens = estimateTokens(formattedOutput);

      results.excludePaths.push({
        ...excludePath,
        files: files.length,
        tokens: totalTokens,
      });
    }
    res.status(200).json(results);
  } catch (error: any) {
    logger.error("Error getting context paths:", error.message);
    res.status(500).json({ error: "Failed to get context paths" });
  }
});

router.post("/set-context-paths", async (req, res) => {
  try {
    const { appId, chatContext } = req.body;
    const schema = z.object({
      appId: z.number(),
      chatContext: AppChatContextSchema,
    });
    schema.parse({ appId, chatContext });

    await db.update(apps).set({ chatContext }).where(eq(apps.id, appId));
    res.status(200).json({ success: true });
  } catch (error: any) {
    logger.error("Error setting context paths:", error.message);
    res.status(500).json({ error: "Failed to set context paths" });
  }
});

router.post("/add-dep", async (req, res) => {
  try {
    const { chatId, packages } = req.body as { chatId: number; packages: string[] };
    // Find the message from the database
    const foundMessages = await db.query.messages.findMany({
      where: eq(messages.chatId, chatId),
    });

    // Find the chat first
    const chat = await db.query.chats.findFirst({
      where: eq(chats.id, chatId),
    });

    if (!chat) {
      throw new Error(`Chat ${chatId} not found`);
    }

    // Get the app using the appId from the chat
    const app = await db.query.apps.findFirst({
      where: eq(apps.id, chat.appId),
    });

    if (!app) {
      throw new Error(`App for chat ${chatId} not found`);
    }

    const message = [...foundMessages]
      .reverse()
      .find((m) =>
        m.content.includes(`<eezi-add-dependency packages="${packages.join(" ")}">`),
      );

    if (!message) {
      throw new Error(`Message with packages ${packages.join(", ")} not found`);
    }

    executeAddDependency({
      packages,
      message,
      appPath: getEeziAppPath(app.path),
    });
    res.status(200).json({ success: true });
  } catch (error: any) {
    logger.error("Error adding dependencies:", error.message);
    res.status(500).json({ error: "Failed to add dependencies" });
  }
});

// ----------------------------
// Chat Stream
// ----------------------------

const activeChatStreams = new Map<
  number,
  { controller: AbortController; data: ChatStreamParams }
>();
// Track partial responses for cancelled streams
const partialResponses = new Map<number, string>();

// Ensure the temp directory exists for storing temporary files
const TEMP_DIR = ensureDir(path.join(getPath("temp"), "eezi-attachments"));

const CODEBASE_PROMPT_PREFIX = "This is my codebase.";
function createCodebasePrompt(codebaseInfo: string): string {
  return `${CODEBASE_PROMPT_PREFIX} ${codebaseInfo}`;
}

router.post("/:chatId/start", async (req, res) => {
  try {
    const chatId = parseInt(req.params.chatId);
    activeChatStreams.set(chatId, {
      controller: new AbortController(),
      data: req.body as ChatStreamParams,
    });
    res.status(200).json({ success: true });
  } catch (error: any) {
    logger.error("Error starting stream:", error.message);
    res.status(500).json({ error: "Failed to start stream" });
  }
});

router.get("/:chatId/stream", async (req, res) => {
  let heartbeat: NodeJS.Timeout | null = null;
  const chatId = parseInt(req.params.chatId);
  try {
    // Set up SSE
    const origin = req.headers.origin ?? "*";
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const currentStream = activeChatStreams.get(chatId);
    if (!currentStream || !currentStream.data)
      throw new Error(`Stream not initiated: ${chatId}`);

    const abortController = currentStream.controller;
    const { prompt, redo, attachments, selectedComponent } = currentStream.data;

    const fileUploadsState = FileUploadsState.getInstance();

    heartbeat = setInterval(() => {
      safeSend(res, "chat:ping", {});
    }, 15000);

    req.on("close", () => {
      logger.info("Client disconnected:", chatId);
      if (heartbeat) clearInterval(heartbeat);
      abortController.abort();
    });

    // Get the chat to check for existing messages
    const chat = await db.query.chats.findFirst({
      where: eq(chats.id, chatId),
      with: {
        messages: {
          orderBy: (messages, { asc }) => [asc(messages.createdAt)],
        },
        app: true, // Include app information
      },
    });

    if (!chat) {
      throw new Error(`Chat not found: ${chatId}`);
    }

    // Handle redo option: remove the most recent messages if needed
    if (redo) {
      // Get the most recent messages
      const chatMessages = [...chat.messages];

      // Find the most recent user message
      let lastUserMessageIndex = chatMessages.length - 1;
      while (
        lastUserMessageIndex >= 0 &&
        chatMessages[lastUserMessageIndex].role !== "user"
      ) {
        lastUserMessageIndex--;
      }

      if (lastUserMessageIndex >= 0) {
        // Delete the user message
        await db
          .delete(messages)
          .where(eq(messages.id, chatMessages[lastUserMessageIndex].id));

        // If there's an assistant message after the user message, delete it too
        if (
          lastUserMessageIndex < chatMessages.length - 1 &&
          chatMessages[lastUserMessageIndex + 1].role === "assistant"
        ) {
          await db
            .delete(messages)
            .where(eq(messages.id, chatMessages[lastUserMessageIndex + 1].id));
        }
      }
    }

    // Process attachments if any
    let attachmentInfo = "";
    let attachmentPaths: string[] = [];

    if (attachments && attachments.length > 0) {
      attachmentInfo = "\n\nAttachments:\n";

      for (const [index, attachment] of attachments.entries()) {
        // Generate a unique filename
        const hash = crypto
          .createHash("md5")
          .update(attachment.name + Date.now())
          .digest("hex");
        const fileExtension = path.extname(attachment.name);
        const filename = `${hash}${fileExtension}`;
        const filePath = path.join(TEMP_DIR, filename);

        // Extract the base64 data (remove the data:mime/type;base64, prefix)
        const base64Data = attachment.data.split(";base64,").pop() || "";

        await writeFile(filePath, Buffer.from(base64Data, "base64"));
        attachmentPaths.push(filePath);

        if (attachment.attachmentType === "upload-to-codebase") {
          // For upload-to-codebase, create a unique file ID and store the mapping
          const fileId = `eezi-attachment-${index}`;

          fileUploadsState.addFileUpload(
            { chatId: chatId, fileId },
            {
              filePath,
              originalName: attachment.name,
            },
          );

          // Add instruction for AI to use eezi-write tag
          attachmentInfo += `\n\nFile to upload to codebase: ${attachment.name} (file id: ${fileId})\n`;
        } else {
          // For chat-context, use the existing logic
          attachmentInfo += `- ${attachment.name} (${attachment.type})\n`;
          // If it's a text-based file, try to include the content
          if (await isTextFile(filePath)) {
            try {
              attachmentInfo += `<eezi-text-attachment filename="${attachment.name}" type="${attachment.type}" path="${filePath}">
                </eezi-text-attachment>
                \n\n`;
            } catch (err) {
              logger.error(`Error reading file content: ${err}`);
            }
          }
        }
      }
    }

    // Add user message to database with attachment info
    let userPrompt = prompt + (attachmentInfo ? attachmentInfo : "");
    // Inline referenced prompt contents for mentions like @prompt:<id>
    try {
      const matches = Array.from(userPrompt.matchAll(/@prompt:(\d+)/g));
      if (matches.length > 0) {
        const ids = Array.from(new Set(matches.map((m) => Number(m[1]))));
        const referenced = await db
          .select()
          .from(prompts)
          .where(inArray(prompts.id, ids));
        if (referenced.length > 0) {
          const promptsMap: Record<number, string> = {};
          for (const p of referenced) {
            promptsMap[p.id] = p.content;
          }
          userPrompt = replacePromptReference(userPrompt, promptsMap);
        }
      }
    } catch (e) {
      logger.error("Failed to inline referenced prompts:", e);
    }
    if (selectedComponent) {
      let componentSnippet = "[component snippet not available]";
      try {
        const componentFileContent = await readFile(
          path.join(getEeziAppPath(chat.app.path), selectedComponent.relativePath),
          "utf8",
        );
        const lines = componentFileContent.split("\n");
        const selectedIndex = selectedComponent.lineNumber - 1;

        // Let's get one line before and three after for context.
        const startIndex = Math.max(0, selectedIndex - 1);
        const endIndex = Math.min(lines.length, selectedIndex + 4);

        const snippetLines = lines.slice(startIndex, endIndex);
        const selectedLineInSnippetIndex = selectedIndex - startIndex;

        if (snippetLines[selectedLineInSnippetIndex]) {
          snippetLines[selectedLineInSnippetIndex] =
            `${snippetLines[selectedLineInSnippetIndex]} // <-- EDIT HERE`;
        }

        componentSnippet = snippetLines.join("\n");
      } catch (err) {
        logger.error(`Error reading selected component file content: ${err}`);
      }

      userPrompt += `\n\nSelected component: ${selectedComponent.name} (file: ${selectedComponent.relativePath})\nSnippet:\n\`\`\`\n${componentSnippet}\n\`\`\``;
    }
    await db
      .insert(messages)
      .values({
        chatId: chatId,
        role: "user",
        content: userPrompt,
      })
      .returning();

    // Add a placeholder assistant message immediately
    const [placeholderAssistantMessage] = await db
      .insert(messages)
      .values({
        chatId: chatId,
        role: "assistant",
        content: "", // Start with empty content
      })
      .returning();

    // Fetch updated chat data after possible deletions and additions
    const updatedChat = await db.query.chats.findFirst({
      where: eq(chats.id, chatId),
      with: {
        messages: {
          orderBy: (messages, { asc }) => [asc(messages.createdAt)],
        },
        app: true, // Include app information
      },
    });

    if (!updatedChat) {
      throw new Error(`Chat not found: ${chatId}`);
    }

    // Send the messages right away so that the loading state is shown for the message.
    safeSend(res, "chat:response:chunk", {
      chatId,
      messages: updatedChat.messages,
    });

    let fullResponse = "";

    // Check if this is a test prompt
    const testResponse = getTestResponse(prompt);

    if (testResponse) {
      // For test prompts, use the dedicated function
      fullResponse = await streamTestResponse(
        res,
        chatId,
        testResponse,
        abortController,
        updatedChat,
      );
    } else {
      // Normal AI processing for non-test prompts
      const settings = readSettings();

      const appPath = getEeziAppPath(updatedChat.app.path);
      const chatContext = selectedComponent
        ? {
            contextPaths: [
              {
                globPath: selectedComponent.relativePath,
              },
            ],
            smartContextAutoIncludes: [],
          }
        : validateChatContext(updatedChat.app.chatContext);

      // Parse app mentions from the prompt
      const mentionedAppNames = parseAppMentions(prompt);

      // Extract codebase for current app
      const { formattedOutput: codebaseInfo, files } = await extractCodebase({
        appPath,
        chatContext,
      });

      // Extract codebases for mentioned apps
      const mentionedAppsCodebases = await extractMentionedAppsCodebases(
        mentionedAppNames,
        updatedChat.app.id, // Exclude current app
      );

      // Combine current app codebase with mentioned apps' codebases
      let otherAppsCodebaseInfo = "";
      if (mentionedAppsCodebases.length > 0) {
        const mentionedAppsSection = mentionedAppsCodebases
          .map(
            ({ appName, codebaseInfo }) =>
              `\n\n=== Referenced App: ${appName} ===\n${codebaseInfo}`,
          )
          .join("");

        otherAppsCodebaseInfo = mentionedAppsSection;

        logger.log(`Added ${mentionedAppsCodebases.length} mentioned app codebases`);
      }

      logger.log(`Extracted codebase information from ${appPath}`);
      logger.log(
        "codebaseInfo: length",
        codebaseInfo.length,
        "estimated tokens",
        codebaseInfo.length / 4,
      );
      const { modelClient, isEngineEnabled } = await getModelClient(
        settings.selectedModel,
        settings,
        files,
      );

      // Prepare message history for the AI
      const messageHistory = updatedChat.messages.map((message) => ({
        role: message.role as "user" | "assistant" | "system",
        content: message.content,
      }));

      // Limit chat history based on maxChatTurnsInContext setting
      // We add 1 because the current prompt counts as a turn.
      const maxChatTurns =
        (settings.maxChatTurnsInContext || MAX_CHAT_TURNS_IN_CONTEXT) + 1;

      // If we need to limit the context, we take only the most recent turns
      let limitedMessageHistory = messageHistory;
      if (messageHistory.length > maxChatTurns * 2) {
        // Each turn is a user + assistant pair
        // Calculate how many messages to keep (maxChatTurns * 2)
        let recentMessages = messageHistory
          .filter((msg) => msg.role !== "system")
          .slice(-maxChatTurns * 2);

        // Ensure the first message is a user message
        if (recentMessages.length > 0 && recentMessages[0].role !== "user") {
          // Find the first user message
          const firstUserIndex = recentMessages.findIndex((msg) => msg.role === "user");
          if (firstUserIndex > 0) {
            // Drop assistant messages before the first user message
            recentMessages = recentMessages.slice(firstUserIndex);
          } else if (firstUserIndex === -1) {
            logger.warn(
              "No user messages found in recent history, set recent messages to empty",
            );
            recentMessages = [];
          }
        }

        limitedMessageHistory = [...recentMessages];

        logger.log(
          `Limiting chat history from ${messageHistory.length} to ${limitedMessageHistory.length} messages (max ${maxChatTurns} turns)`,
        );
      }

      let systemPrompt = constructSystemPrompt({
        aiRules: await readAiRules(getEeziAppPath(updatedChat.app.path)),
        chatMode:
          settings.selectedChatMode === "agent" ? "build" : settings.selectedChatMode,
      });

      // Add information about mentioned apps if any
      if (otherAppsCodebaseInfo) {
        const mentionedAppsList = mentionedAppsCodebases
          .map(({ appName }) => appName)
          .join(", ");

        systemPrompt += `\n\n# Referenced Apps\nThe user has mentioned the following apps in their prompt: ${mentionedAppsList}. Their codebases have been included in the context for your reference. When referring to these apps, you can understand their structure and code to provide better assistance, however you should NOT edit the files in these referenced apps. The referenced apps are NOT part of the current app and are READ-ONLY.`;
      }
      if (updatedChat.app?.supabaseProjectId && settings.supabase?.accessToken?.value) {
        systemPrompt +=
          "\n\n" +
          SUPABASE_AVAILABLE_SYSTEM_PROMPT +
          "\n\n" +
          (await getSupabaseContext({
            supabaseProjectId: updatedChat.app.supabaseProjectId,
          }));
      } else if (
        // Neon projects don't need Supabase.
        !updatedChat.app?.neonProjectId
      ) {
        systemPrompt += "\n\n" + SUPABASE_NOT_AVAILABLE_SYSTEM_PROMPT;
      }
      const isSummarizeIntent = prompt.startsWith("Summarize from chat-id=");
      if (isSummarizeIntent) {
        systemPrompt = SUMMARIZE_CHAT_SYSTEM_PROMPT;
      }

      // Update the system prompt for images if there are image attachments
      const hasImageAttachments =
        attachments &&
        attachments.some((attachment) => attachment.type.startsWith("image/"));

      const hasUploadedAttachments =
        attachments &&
        attachments.some(
          (attachment) => attachment.attachmentType === "upload-to-codebase",
        );
      // If there's mixed attachments (e.g. some upload to codebase attachments and some upload images as chat context attachemnts)
      // we will just include the file upload system prompt, otherwise the AI gets confused and doesn't reliably
      // print out the eezi-write tags.
      // Usually, AI models will want to use the image as reference to generate code (e.g. UI mockups) anyways, so
      // it's not that critical to include the image analysis instructions.
      if (hasUploadedAttachments) {
        systemPrompt += `When files are attached to this conversation, upload them to the codebase using this exact format:\n<eezi-write path="path/to/destination/filename.ext" description="Upload file to codebase">\neezi-attachment-X\n</eezi-write>\n\nExample for file with id of eezi-attachment-0:\n<eezi-write path="src/components/Button.jsx" description="Upload file to codebase">\neezi-attachment-0\n</eezi-write>`;
      } else if (hasImageAttachments) {
        systemPrompt += `# Image Analysis Instructions\nThis conversation includes one or more image attachments. When the user uploads images:\n1. If the user explicitly asks for analysis, description, or information about the image, please analyze the image content.\n2. Describe what you see in the image if asked.\n3. You can use images as references when the user has coding or design-related questions.\n4. For diagrams or wireframes, try to understand the content and structure shown.\n5. For screenshots of code or errors, try to identify the issue or explain the code.`;
      }

      const codebasePrefix = !isEngineEnabled
        ? ([
            {
              role: "user",
              content: createCodebasePrompt(codebaseInfo),
            },
            {
              role: "assistant",
              content: "OK, got it. I'm ready to help",
            },
          ] as const)
        : []; // No codebase prefix if engine is set, we will take of it there.

      // If engine is enabled, we will send the other apps codebase info to the engine
      // and process it with smart context.
      const otherCodebasePrefix =
        otherAppsCodebaseInfo && !isEngineEnabled
          ? ([
              {
                role: "user",
                content: createOtherAppsCodebasePrompt(otherAppsCodebaseInfo),
              },
              {
                role: "assistant",
                content: "OK.",
              },
            ] as const)
          : [];

      const limitedHistoryChatMessages = limitedMessageHistory.map((msg) => ({
        role: msg.role as "user" | "assistant" | "system",
        // Why remove thinking tags?
        // Thinking tags are generally not critical for the context
        // and eats up extra tokens.
        content:
          settings.selectedChatMode === "ask"
            ? removeEeziTags(removeNonEssentialTags(msg.content))
            : removeNonEssentialTags(msg.content),
      }));

      let chatMessages: ModelMessage[] = [
        ...codebasePrefix,
        ...otherCodebasePrefix,
        ...limitedHistoryChatMessages,
      ];

      // Check if the last message should include attachments
      if (chatMessages.length >= 2 && attachmentPaths.length > 0) {
        const lastUserIndex = chatMessages.length - 2;
        const lastUserMessage = chatMessages[lastUserIndex];

        if (lastUserMessage.role === "user") {
          // Replace the last message with one that includes attachments
          chatMessages[lastUserIndex] = await prepareMessageWithAttachments(
            lastUserMessage,
            attachmentPaths,
          );
        }
      }

      if (isSummarizeIntent) {
        const previousChat = await db.query.chats.findFirst({
          where: eq(chats.id, parseInt(prompt.split("=")[1])),
          with: {
            messages: {
              orderBy: (messages, { asc }) => [asc(messages.createdAt)],
            },
          },
        });
        chatMessages = [
          {
            role: "user",
            content:
              "Summarize the following chat: " +
              formatMessagesForSummary(previousChat?.messages ?? []),
          } satisfies ModelMessage,
        ];
      }

      const simpleStreamText = async ({
        chatMessages,
        modelClient,
        tools,
        systemPromptOverride = systemPrompt,
        eeziDisableFiles = false,
      }: {
        chatMessages: ModelMessage[];
        modelClient: ModelClient;
        tools?: ToolSet;
        systemPromptOverride?: string;
        eeziDisableFiles?: boolean;
      }) => {
        const eeziRequestId = uuidv4();
        if (isEngineEnabled) {
          logger.log("sending AI request to engine with request id:", eeziRequestId);
        } else {
          logger.log("sending AI request");
        }
        // Build provider options with correct Google/Vertex thinking config gating
        const providerOptions: Record<string, any> = {
          "eezi-engine": {
            eeziRequestId,
            eeziDisableFiles,
            eeziMentionedApps: mentionedAppsCodebases.map(({ files, appName }) => ({
              appName,
              files,
            })),
          },
          "eezi-gateway": getExtraProviderOptions(
            modelClient.builtinProviderId,
            settings,
          ),
          openai: {
            reasoningSummary: "auto",
          } satisfies OpenAIResponsesProviderOptions,
        };

        // Conditionally include Google thinking config only for supported models
        const selectedModelName = settings.selectedModel.name || "";
        const providerId = modelClient.builtinProviderId;
        const isVertex = providerId === "vertex";
        const isGoogle = providerId === "google";
        const isAnthropic = providerId === "anthropic";
        const isPartnerModel = selectedModelName.includes("/");
        const isGeminiModel = selectedModelName.startsWith("gemini");
        const isFlashLite = selectedModelName.includes("flash-lite");

        // Keep Google provider behavior unchanged: always include includeThoughts
        if (isGoogle) {
          providerOptions.google = {
            thinkingConfig: {
              includeThoughts: true,
            },
          } satisfies GoogleGenerativeAIProviderOptions;
        }

        // Vertex-specific fix: only enable thinking on supported Gemini models
        if (isVertex && isGeminiModel && !isFlashLite && !isPartnerModel) {
          providerOptions.google = {
            thinkingConfig: {
              includeThoughts: true,
            },
          } satisfies GoogleGenerativeAIProviderOptions;
        }

        return streamText({
          headers: isAnthropic
            ? {
                "anthropic-beta": "context-1m-2025-08-07",
              }
            : undefined,
          maxOutputTokens: await getMaxTokens(settings.selectedModel),
          temperature: await getTemperature(settings.selectedModel),
          maxRetries: 2,
          model: modelClient.model,
          stopWhen: [stepCountIs(20), hasToolCall("edit-code")],
          providerOptions,
          system: systemPromptOverride,
          tools,
          messages: chatMessages.filter((m) => m.content),
          onError: (error: any) => {
            logger.error("Error streaming text:", error.message);
            let errorMessage = (error as any)?.error?.message;
            const responseBody = error?.error?.responseBody;
            if (errorMessage && responseBody) {
              errorMessage += "\n\nDetails: " + responseBody;
            }
            const message = errorMessage || JSON.stringify(error);
            const requestIdPrefix = isEngineEnabled
              ? `[Request ID: ${eeziRequestId}] `
              : "";
            safeSend(res, "chat:response:error", {
              chatId: chatId,
              error: `Sorry, there was an error from the AI: ${requestIdPrefix}${message}`,
            });
            // Clean up the abort controller
            activeChatStreams.delete(chatId);
            // Clean up file uploads state on error
            FileUploadsState.getInstance().clear(chatId);
          },
          abortSignal: abortController.signal,
        });
      };

      let lastDbSaveAt = 0;

      const processResponseChunkUpdate = async ({
        fullResponse,
      }: {
        fullResponse: string;
      }) => {
        if (
          fullResponse.includes("$$SUPABASE_CLIENT_CODE$$") &&
          updatedChat.app?.supabaseProjectId
        ) {
          const supabaseClientCode = await getSupabaseClientCode({
            projectId: updatedChat.app?.supabaseProjectId,
          });
          fullResponse = fullResponse.replace(
            "$$SUPABASE_CLIENT_CODE$$",
            supabaseClientCode,
          );
        }
        // Store the current partial response
        partialResponses.set(chatId, fullResponse);
        // Save to DB (in case user is switching chats during the stream)
        const now = Date.now();
        if (now - lastDbSaveAt >= 150) {
          await db
            .update(messages)
            .set({ content: fullResponse })
            .where(eq(messages.id, placeholderAssistantMessage.id));

          lastDbSaveAt = now;
        }

        // Update the placeholder assistant message content in the messages array
        const currentMessages = [...updatedChat.messages];
        if (
          currentMessages.length > 0 &&
          currentMessages[currentMessages.length - 1].role === "assistant"
        ) {
          currentMessages[currentMessages.length - 1].content = fullResponse;
        }

        // Update the assistant message in the database
        safeSend(res, "chat:response:chunk", {
          chatId,
          messages: currentMessages,
        });
        return fullResponse;
      };

      if (settings.selectedChatMode === "agent") {
        const tools = await getMcpTools(res, chatId);

        const { fullStream } = await simpleStreamText({
          chatMessages: limitedHistoryChatMessages,
          modelClient,
          tools: {
            ...tools,
            "generate-code": {
              description:
                "ALWAYS use this tool whenever generating or editing code for the codebase.",
              inputSchema: z.object({}),
              execute: async () => "",
            },
          },
          systemPromptOverride: constructSystemPrompt({
            aiRules: await readAiRules(getEeziAppPath(updatedChat.app.path)),
            chatMode: "agent",
          }),
          eeziDisableFiles: true,
        });

        const result = await processStreamChunks({
          fullStream,
          fullResponse,
          abortController,
          chatId: chatId,
          processResponseChunkUpdate,
        });
        fullResponse = result.fullResponse;
        chatMessages.push({
          role: "assistant",
          content: fullResponse,
        });
        chatMessages.push({
          role: "user",
          content: "OK.",
        });
      }

      // When calling streamText, the messages need to be properly formatted for mixed content
      const { fullStream } = await simpleStreamText({
        chatMessages,
        modelClient,
      });

      // Process the stream as before
      try {
        const result = await processStreamChunks({
          fullStream,
          fullResponse,
          abortController,
          chatId: chatId,
          processResponseChunkUpdate,
        });
        fullResponse = result.fullResponse;

        if (
          !abortController.signal.aborted &&
          settings.selectedChatMode !== "ask" &&
          hasUnclosedEeziWrite(fullResponse)
        ) {
          let continuationAttempts = 0;
          while (
            hasUnclosedEeziWrite(fullResponse) &&
            continuationAttempts < 2 &&
            !abortController.signal.aborted
          ) {
            logger.warn(
              `Received unclosed eezi-write tag, attempting to continue, attempt #${
                continuationAttempts + 1
              }`,
            );
            continuationAttempts++;

            const { fullStream: contStream } = await simpleStreamText({
              // Build messages: replay history then pre-fill assistant with current partial.
              chatMessages: [
                ...chatMessages,
                { role: "assistant", content: fullResponse },
              ],
              modelClient,
            });
            for await (const part of contStream) {
              // If the stream was aborted, exit early
              if (abortController.signal.aborted) {
                logger.log(`Stream for chat ${chatId} was aborted`);
                break;
              }
              if (part.type !== "text-delta") continue; // ignore reasoning for continuation
              fullResponse += part.text;
              fullResponse = cleanFullResponse(fullResponse);
              fullResponse = await processResponseChunkUpdate({
                fullResponse,
              });
            }
          }
        }
        const addDependencies = getEeziAddDependencyTags(fullResponse);
        if (
          !abortController.signal.aborted &&
          // If there are dependencies, we don't want to auto-fix problems
          // because there's going to be type errors since the packages aren't
          // installed yet.
          addDependencies.length === 0 &&
          settings.enableAutoFixProblems &&
          settings.selectedChatMode !== "ask"
        ) {
          try {
            // IF auto-fix is enabled
            let problemReport = await generateProblemReport({
              fullResponse,
              appPath: getEeziAppPath(updatedChat.app.path),
            });

            let autoFixAttempts = 0;
            const originalFullResponse = fullResponse;
            const previousAttempts: ModelMessage[] = [];
            while (
              problemReport.problems.length > 0 &&
              autoFixAttempts < 2 &&
              !abortController.signal.aborted
            ) {
              fullResponse += `<eezi-problem-report summary="${
                problemReport.problems.length
              } problems">\n${problemReport.problems
                .map(
                  (problem) =>
                    `<problem file="${escapeXml(problem.file)}" line="${
                      problem.line
                    }" column="${problem.column}" code="${problem.code}">${escapeXml(
                      problem.message,
                    )}</problem>`,
                )
                .join("\n")}\n</eezi-problem-report>`;

              logger.info(
                `Attempting to auto-fix problems, attempt #${autoFixAttempts + 1}`,
              );
              autoFixAttempts++;
              const problemFixPrompt = createProblemFixPrompt(problemReport);

              const virtualFileSystem = new AsyncVirtualFileSystem(
                getEeziAppPath(updatedChat.app.path),
                {
                  fileExists: (fileName: string) => fileExists(fileName),
                  readFile: (fileName: string) => readFileWithCache(fileName),
                },
              );
              const writeTags = getEeziWriteTags(fullResponse);
              const renameTags = getEeziRenameTags(fullResponse);
              const deletePaths = getEeziDeleteTags(fullResponse);
              virtualFileSystem.applyResponseChanges({
                deletePaths,
                renameTags,
                writeTags,
              });

              const { formattedOutput: codebaseInfo, files } = await extractCodebase({
                appPath,
                chatContext,
                virtualFileSystem,
              });
              const { modelClient } = await getModelClient(
                settings.selectedModel,
                settings,
                files,
              );

              const { fullStream } = await simpleStreamText({
                modelClient,
                chatMessages: [
                  ...chatMessages.map((msg, index) => {
                    if (
                      index === 0 &&
                      msg.role === "user" &&
                      typeof msg.content === "string" &&
                      msg.content.startsWith(CODEBASE_PROMPT_PREFIX)
                    ) {
                      return {
                        role: "user",
                        content: createCodebasePrompt(codebaseInfo),
                      } as const;
                    }
                    return msg;
                  }),
                  {
                    role: "assistant",
                    content: removeNonEssentialTags(originalFullResponse),
                  },
                  ...previousAttempts,
                  { role: "user", content: problemFixPrompt },
                ],
              });
              previousAttempts.push({
                role: "user",
                content: problemFixPrompt,
              });
              const result = await processStreamChunks({
                fullStream,
                fullResponse,
                abortController,
                chatId: chatId,
                processResponseChunkUpdate,
              });
              fullResponse = result.fullResponse;
              previousAttempts.push({
                role: "assistant",
                content: removeNonEssentialTags(result.incrementalResponse),
              });

              problemReport = await generateProblemReport({
                fullResponse,
                appPath: getEeziAppPath(updatedChat.app.path),
              });
            }
          } catch (error: any) {
            logger.error(
              "Error generating problem report or auto-fixing:",
              settings.enableAutoFixProblems,
              error,
            );
          }
        }
      } catch (streamError) {
        // Check if this was an abort error
        if (abortController.signal.aborted) {
          const partialResponse = partialResponses.get(chatId);
          // If we have a partial response, save it to the database
          if (partialResponse) {
            try {
              // Update the placeholder assistant message with the partial content and cancellation note
              await db
                .update(messages)
                .set({
                  content: `${partialResponse}\n[Response cancelled by user]`,
                })
                .where(eq(messages.id, placeholderAssistantMessage.id));

              logger.log(
                `Updated cancelled response for placeholder message ${placeholderAssistantMessage.id} in chat ${chatId}`,
              );
              partialResponses.delete(chatId);
            } catch (error: any) {
              logger.error(`Error saving partial response for chat ${chatId}:`, error);
            }
          }
          return chatId;
        }
        throw streamError;
      }
    }

    // Only save the response and process it if we weren't aborted
    if (!abortController.signal.aborted && fullResponse) {
      // Scrape from: <eezi-chat-summary>Renaming profile file</eezi-chat-title>
      const chatTitle = fullResponse.match(
        /<eezi-chat-summary>(.*?)<\/eezi-chat-summary>/,
      );
      if (chatTitle) {
        await db
          .update(chats)
          .set({ title: chatTitle[1] })
          .where(and(eq(chats.id, chatId), isNull(chats.title)));
      }
      const chatSummary = chatTitle?.[1];

      // Update the placeholder assistant message with the full response
      await db
        .update(messages)
        .set({ content: fullResponse })
        .where(eq(messages.id, placeholderAssistantMessage.id));
      const settings = readSettings();
      if (settings.autoApproveChanges && settings.selectedChatMode !== "ask") {
        const status = await processFullResponseActions(
          fullResponse,
          chatId,
          {
            chatSummary,
            messageId: placeholderAssistantMessage.id,
          }, // Use placeholder ID
        );

        const chat = await db.query.chats.findFirst({
          where: eq(chats.id, chatId),
          with: {
            messages: {
              orderBy: (messages, { asc }) => [asc(messages.createdAt)],
            },
          },
        });

        safeSend(res, "chat:response:chunk", {
          chatId,
          messages: chat!.messages,
        });

        if (status.error) {
          safeSend(res, "chat:response:error", {
            chatId,
            error: `Sorry, there was an error applying the AI's changes: ${status.error}`,
          });
        }

        // Signal that the stream has completed
        safeSend(res, "chat:response:end", {
          chatId,
          updatedFiles: status.updatedFiles ?? false,
          extraFiles: status.extraFiles,
          extraFilesError: status.extraFilesError,
        } satisfies ChatResponseEnd);
      } else {
        safeSend(res, "chat:response:end", {
          chatId,
          updatedFiles: false,
        } satisfies ChatResponseEnd);
      }
    }

    // Clean up any temporary files
    if (attachmentPaths.length > 0) {
      for (const filePath of attachmentPaths) {
        try {
          // We don't immediately delete files because they might be needed for reference
          // Instead, schedule them for deletion after some time
          setTimeout(
            async () => {
              if (fs.existsSync(filePath)) {
                await unlink(filePath);
                logger.log(`Deleted temporary file: ${filePath}`);
              }
            },
            30 * 60 * 1000,
          ); // Delete after 30 minutes
        } catch (error: any) {
          logger.error(`Error scheduling file deletion: ${error}`);
        }
      }
    }
  } catch (error: any) {
    logger.error("Error streaming chat:", error.message);
    safeSend(res, "chat:response:error", {
      chatId,
      error: `Sorry, there was an error processing your request: ${error}`,
    });
    if (heartbeat) clearInterval(heartbeat);
    // Clean up the abort controller
    activeChatStreams.delete(chatId);
    // Clean up file uploads state on error
    FileUploadsState.getInstance().clear(chatId);
  }
});

// Cancel chat stream
router.delete("/:chatId/cancel", async (req, res) => {
  const chatId = parseInt(req.params.chatId);
  try {
    if (activeChatStreams.has(chatId)) {
      activeChatStreams.delete(chatId);
      // Clean up uploads state for this chat
      FileUploadsState.getInstance().clear(chatId);

      logger.log(`Canceled active stream for chat ${chatId}`);
      res.status(200).json({ success: true });
    } else {
      console.warn(`No active stream found for chat ${chatId}`);
      res.status(404).json({ error: "No active stream found" });
    }
  } catch (error: any) {
    logger.error("Error canceling chat stream:", error.message);
    res.status(500).json({ error: "Failed to cancel chat stream" });
  }
});

// --------------------------------
// Help Stream
// --------------------------------

// In-memory session store for help bot conversations
type HelpMessage = { role: "user" | "assistant"; content: string };
const helpSessions = new Map<string, HelpMessage[]>();

const activeHelpStreams = new Map<
  string,
  { controller: AbortController; message: string }
>();

router.post("/help/:sessionId/start", async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    activeHelpStreams.set(sessionId, {
      controller: new AbortController(),
      message: req.body.message,
    });
    res.status(200).json({ success: true });
  } catch (error: any) {
    logger.error("Error starting help stream:", error.message);
    res.status(500).json({ error: "Failed to start help stream" });
  }
});

router.get("/help/:sessionId/stream", async (req, res) => {
  let heartbeat: NodeJS.Timeout | null = null;
  const sessionId = req.params.sessionId;
  try {
    // Set up SSE
    const origin = req.headers.origin ?? "*";
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const currentStream = activeHelpStreams.get(sessionId);
    if (!currentStream || !currentStream.message)
      throw new Error(`Stream not initiated: ${sessionId}`);

    const { controller: abortController, message } = currentStream;

    heartbeat = setInterval(() => {
      safeSend(res, "help:ping", {});
    }, 15000);

    req.on("close", () => {
      logger.log(`Client disconnected from help ${sessionId} run stream.`);
      if (heartbeat) clearInterval(heartbeat);
      abortController.abort();
    });

    // Append user message to session history
    const history = helpSessions.get(sessionId) ?? [];
    const updatedHistory: HelpMessage[] = [
      ...history,
      { role: "user", content: message },
    ];

    const settings = await readSettings();
    const apiKey = settings.providerSettings?.["auto"]?.apiKey?.value;
    const provider = createOpenAI({
      baseURL: "https://helpchat.dyad.sh/v1",
      apiKey,
    });

    let assistantContent = "";

    const stream = streamText({
      model: provider.responses("gpt-5-nano"),
      providerOptions: {
        openai: {
          reasoningSummary: "auto",
        } satisfies OpenAIResponsesProviderOptions,
      },
      tools: {
        web_search_preview: openai.tools.webSearchPreview({
          searchContextSize: "high",
        }) as Tool,
      },
      messages: updatedHistory as any,
      maxRetries: 1,
      onError: (error) => {
        let errorMessage = (error as any)?.error?.message;
        logger.error("help bot stream error", errorMessage);
        safeSend(res, "help:chat:error", {
          sessionId,
          error: String(errorMessage),
        });
      },
    });

    (async () => {
      try {
        for await (const part of stream.fullStream) {
          if (abortController.signal.aborted) break;

          if (part.type === "text-delta") {
            assistantContent += part.text;
            safeSend(res, "help:chat:chunk", {
              sessionId,
              delta: part.text,
              type: "text",
            });
          }
        }

        // Finalize session history
        const finalHistory: HelpMessage[] = [
          ...updatedHistory,
          { role: "assistant", content: assistantContent },
        ];
        helpSessions.set(sessionId, finalHistory);

        safeSend(res, "help:chat:end", { sessionId });
      } catch (err) {
        if ((err as any)?.name === "AbortError") {
          logger.log("help bot stream aborted", sessionId);
          return;
        }
        logger.error("help bot stream loop error", err);
        safeSend(res, "help:chat:error", {
          sessionId,
          error: String(err instanceof Error ? err.message : err),
        });
      } finally {
        activeHelpStreams.delete(sessionId);
      }
    })();
  } catch (err: any) {
    logger.error("Error in help:chat", err.message);
    safeSend(res, "help:chat:error", {
      sessionId,
      error: String(err instanceof Error ? err.message : err),
    });

    if (heartbeat) clearInterval(heartbeat);
    // Clean up the abort controller
    activeHelpStreams.delete(sessionId);
  }
});

router.delete("/help/:sessionId/cancel", async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const stream = activeHelpStreams.get(sessionId);
    if (stream) {
      stream.controller.abort();
      activeHelpStreams.delete(sessionId);
      res.status(200).json({ success: true });
    } else {
      console.warn(`No active stream found for help ${sessionId}`);
      res.status(404).json({ error: "No active stream found" });
    }
  } catch (error: any) {
    logger.error("Error canceling help stream:", error.message);
    res.status(500).json({ error: "Failed to cancel help stream" });
  }
});

// --- Proposal Management  ---
router.get("/get-proposal/:chatId", async (req, res) => {
  try {
    const chatId = parseInt(req.params.chatId);
    const result = await withLock("get-proposal:" + chatId, async () => {
      logger.log(`get-proposal called for chatId: ${chatId}`);

      try {
        // Find the latest ASSISTANT message for the chat
        const latestAssistantMessage = await db.query.messages.findFirst({
          where: and(eq(messages.chatId, chatId), eq(messages.role, "assistant")),
          orderBy: [desc(messages.createdAt)],
          columns: {
            id: true, // Fetch the ID
            content: true, // Fetch the content to parse
            approvalState: true,
          },
        });

        if (
          latestAssistantMessage?.content &&
          latestAssistantMessage.id &&
          !latestAssistantMessage?.approvalState
        ) {
          const messageId = latestAssistantMessage.id; // Get the message ID
          logger.log(
            `Found latest assistant message (ID: ${messageId}), parsing content...`,
          );
          const messageContent = latestAssistantMessage.content;

          const proposalTitle = getEeziChatSummaryTag(messageContent);

          const proposalWriteFiles = getEeziWriteTags(messageContent);
          const proposalRenameFiles = getEeziRenameTags(messageContent);
          const proposalDeleteFiles = getEeziDeleteTags(messageContent);
          const proposalExecuteSqlQueries = getEeziExecuteSqlTags(messageContent);
          const packagesAdded = getEeziAddDependencyTags(messageContent);

          const filesChanged = [
            ...proposalWriteFiles.map((tag) => ({
              name: path.basename(tag.path),
              path: tag.path,
              summary: tag.description ?? "(no change summary found)", // Generic summary
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
          // Check if we have enough information to create a proposal
          if (
            filesChanged.length > 0 ||
            packagesAdded.length > 0 ||
            proposalExecuteSqlQueries.length > 0
          ) {
            const proposal: CodeProposal = {
              type: "code-proposal",
              // Use parsed title or a default title if summary tag is missing but write tags exist
              title: proposalTitle ?? "Proposed File Changes",
              securityRisks: [], // Keep empty
              filesChanged,
              packagesAdded,
              sqlQueries: proposalExecuteSqlQueries.map((query) => ({
                content: query.content,
                description: query.description,
              })),
            };
            logger.log(
              "Generated code proposal. title=",
              proposal.title,
              "files=",
              proposal.filesChanged.length,
              "packages=",
              proposal.packagesAdded.length,
            );

            return {
              proposal: proposal,
              chatId,
              messageId,
            };
          } else {
            logger.log(
              "No relevant tags found in the latest assistant message content.",
            );
          }
        }
        const actions: ActionProposal["actions"] = [];
        if (latestAssistantMessage?.content) {
          const writeTags = getEeziWriteTags(latestAssistantMessage.content);
          const refactorTarget = writeTags.reduce(
            (largest, tag) => {
              const lineCount = tag.content.split("\n").length;
              return lineCount > 500 && (!largest || lineCount > largest.lineCount)
                ? { path: tag.path, lineCount }
                : largest;
            },
            null as { path: string; lineCount: number } | null,
          );
          if (refactorTarget) {
            actions.push({
              id: "refactor-file",
              path: refactorTarget.path,
            });
          }
          if (writeTags.length === 0 && latestAssistantMessage.content.includes("```")) {
            actions.push({
              id: "write-code-properly",
            });
          }

          // Check for command tags and add corresponding actions
          const commandTags = getEeziCommandTags(latestAssistantMessage.content);
          if (commandTags.includes("rebuild")) {
            actions.push({
              id: "rebuild",
            });
          }
          if (commandTags.includes("restart")) {
            actions.push({
              id: "restart",
            });
          }
          if (commandTags.includes("refresh")) {
            actions.push({
              id: "refresh",
            });
          }
        }

        // Get all chat messages to calculate token usage
        const chat = await db.query.chats.findFirst({
          where: eq(chats.id, chatId),
          with: {
            app: true,
            messages: {
              orderBy: (messages, { asc }) => [asc(messages.createdAt)],
            },
          },
        });

        if (latestAssistantMessage && chat) {
          // Calculate total tokens from message history
          const messagesTokenCount = estimateMessagesTokens(chat.messages);

          // Use cached token count or calculate new one
          const codebaseTokenCount = await getCodebaseTokenCount(
            chatId,
            latestAssistantMessage.id,
            latestAssistantMessage.content || "",
            chat.app.path,
            chat.app.chatContext,
          );

          const totalTokens = messagesTokenCount + codebaseTokenCount;
          const contextWindow = Math.min(await getContextWindow(), 100_000);
          logger.log(
            `Token usage: ${totalTokens}/${contextWindow} (${
              (totalTokens / contextWindow) * 100
            }%)`,
          );

          // If we're using more than 80% of the context window, suggest summarizing
          if (totalTokens > contextWindow * 0.8 || chat.messages.length > 10) {
            logger.log(
              `Token usage is high (${totalTokens}/${contextWindow}) OR long chat history (${chat.messages.length} messages), suggesting summarize action`,
            );
            actions.push({
              id: "summarize-in-new-chat",
            });
          }
        }
        if (latestAssistantMessage) {
          actions.push({
            id: "keep-going",
          });
          return {
            proposal: {
              type: "action-proposal",
              actions: actions,
            },
            chatId,
            messageId: latestAssistantMessage.id,
          };
        }
        return null;
      } catch (error: any) {
        logger.error(`Error processing proposal for chatId ${chatId}:`, error);
        return null; // Indicate DB or processing error
      }
    });
    res.status(200).json(result);
  } catch (error: any) {
    logger.error("Error in getting proposal:", error.message);
    res.status(500).json({ error: "Failed to get proposal" });
  }
});

// Handler to approve a proposal (process actions and update message)
router.post("/approve-proposal", async (req, res) => {
  try {
    const { chatId, messageId } = req.body;
    const settings = readSettings();
    if (settings.selectedChatMode === "ask") {
      throw new Error(
        "Ask mode is not supported for proposal approval. Please switch to build mode.",
      );
    }
    // 1. Fetch the specific assistant message
    const messageToApprove = await db.query.messages.findFirst({
      where: and(
        eq(messages.id, messageId),
        eq(messages.chatId, chatId),
        eq(messages.role, "assistant"),
      ),
      columns: {
        content: true,
      },
    });

    if (!messageToApprove?.content) {
      throw new Error(
        `Assistant message not found for chatId: ${chatId}, messageId: ${messageId}`,
      );
    }

    // 2. Process the actions defined in the message content
    const chatSummary = getEeziChatSummaryTag(messageToApprove.content);
    const processResult = await processFullResponseActions(
      messageToApprove.content,
      chatId,
      {
        chatSummary: chatSummary ?? undefined,
        messageId,
      }, // Pass summary if found
    );

    if (processResult.error) {
      throw new Error(
        `Error processing actions for message ${messageId}: ${processResult.error}`,
      );
    }

    res.status(200).json({
      extraFiles: processResult.extraFiles,
      extraFilesError: processResult.extraFilesError,
    });
  } catch (error: any) {
    logger.error("Error approving proposal:", error.message);
    res.status(500).json({ error: "Failed to approve proposal: " + error });
  }
});

// Handler to reject a proposal (just update message state)
router.patch("/reject-proposal", async (req, res) => {
  try {
    const { chatId, messageId } = req.body;
    logger.log(`reject-proposal called for chatId: ${chatId}, messageId: ${messageId}`);

    // 1. Verify the message exists and is an assistant message
    const messageToReject = await db.query.messages.findFirst({
      where: and(
        eq(messages.id, messageId),
        eq(messages.chatId, chatId),
        eq(messages.role, "assistant"),
      ),
      columns: { id: true },
    });

    if (!messageToReject) {
      throw new Error(
        `Assistant message not found for chatId: ${chatId}, messageId: ${messageId}`,
      );
    }

    // 2. Update the message's approval state to 'rejected'
    await db
      .update(messages)
      .set({ approvalState: "rejected" })
      .where(eq(messages.id, messageId));

    logger.log(`Message ${messageId} marked as rejected.`);
    res.status(200).json({ success: true });
  } catch (error: any) {
    logger.error("Error rejecting proposal:", error.message);
    res.status(500).json({ error: "Failed to reject proposal: " + error });
  }
});

router.post("/count-tokens", async (req, res) => {
  try {
    const { chatId, input } = req.body;
    const chat = await db.query.chats.findFirst({
      where: eq(chats.id, chatId),
      with: {
        messages: {
          orderBy: (messages, { asc }) => [asc(messages.createdAt)],
        },
        app: true,
      },
    });

    if (!chat) {
      throw new Error(`Chat not found: ${chatId}`);
    }

    // Prepare message history for token counting
    const messageHistory = chat.messages.map((message) => message.content).join("");
    const messageHistoryTokens = estimateTokens(messageHistory);

    // Count input tokens
    const inputTokens = estimateTokens(input);

    const settings = readSettings();

    // Parse app mentions from the input
    const mentionedAppNames = parseAppMentions(input);

    // Count system prompt tokens
    let systemPrompt = constructSystemPrompt({
      aiRules: await readAiRules(getEeziAppPath(chat.app.path)),
      chatMode: settings.selectedChatMode,
    });
    let supabaseContext = "";

    if (chat.app?.supabaseProjectId) {
      systemPrompt += "\n\n" + SUPABASE_AVAILABLE_SYSTEM_PROMPT;
      supabaseContext = await getSupabaseContext({
        supabaseProjectId: chat.app.supabaseProjectId,
      });
    } else if (
      // Neon projects don't need Supabase.
      !chat.app?.neonProjectId
    ) {
      systemPrompt += "\n\n" + SUPABASE_NOT_AVAILABLE_SYSTEM_PROMPT;
    }

    const systemPromptTokens = estimateTokens(systemPrompt + supabaseContext);

    // Extract codebase information if app is associated with the chat
    let codebaseInfo = "";
    let codebaseTokens = 0;

    if (chat.app) {
      const appPath = getEeziAppPath(chat.app.path);
      const { formattedOutput, files } = await extractCodebase({
        appPath,
        chatContext: validateChatContext(chat.app.chatContext),
      });
      codebaseInfo = formattedOutput;
      if (settings.enableEeziPro && settings.enableProSmartFilesContextMode) {
        codebaseTokens = estimateTokens(
          files
            // It doesn't need to be the exact format but it's just to get a token estimate
            .map((file) => `<eezi-file=${file.path}>${file.content}</eezi-file>`)
            .join("\n\n"),
        );
      } else {
        codebaseTokens = estimateTokens(codebaseInfo);
      }
      logger.log(
        `Extracted codebase information from ${appPath}, tokens: ${codebaseTokens}`,
      );
    }

    // Extract codebases for mentioned apps
    const mentionedAppsCodebases = await extractMentionedAppsCodebases(
      mentionedAppNames,
      chat.app?.id, // Exclude current app
    );

    // Calculate tokens for mentioned apps
    let mentionedAppsTokens = 0;
    if (mentionedAppsCodebases.length > 0) {
      const mentionedAppsContent = mentionedAppsCodebases
        .map(
          ({ appName, codebaseInfo }) =>
            `\n\n=== Referenced App: ${appName} ===\n${codebaseInfo}`,
        )
        .join("");

      mentionedAppsTokens = estimateTokens(mentionedAppsContent);

      logger.log(
        `Extracted ${mentionedAppsCodebases.length} mentioned app codebases, tokens: ${mentionedAppsTokens}`,
      );
    }

    // Calculate total tokens
    const totalTokens =
      messageHistoryTokens +
      inputTokens +
      systemPromptTokens +
      codebaseTokens +
      mentionedAppsTokens;

    res.status(200).json({
      totalTokens,
      messageHistoryTokens,
      codebaseTokens,
      mentionedAppsTokens,
      inputTokens,
      systemPromptTokens,
      contextWindow: await getContextWindow(),
    });
  } catch (error: any) {
    logger.error("Error counting tokens:", error.message);
    res.status(500).json({ error: "Failed to count tokens: " + error });
  }
});
export default router;
