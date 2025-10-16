import { Router } from "express";
import logger from "../logger";
import { db } from "../db";
import { apps, chats, messages } from "../db/schema";
import { desc, eq, and, like } from "drizzle-orm";
import { executeAddDependency } from "../ipc/processors/executeAddDependency";
import { processFullResponseActions } from "../ipc/processors/response_processor";
import {
  getDyadWriteTags,
  getDyadDeleteTags,
  getDyadRenameTags,
} from "../ipc/utils/dyad_tag_parser";
import { readSettings } from "../../../shared/settings";
import { gitCommit } from "../ipc/utils/git_utils";
import {
  type Chat,
  type Message,
  type ChatResponseEnd,
  type UpdateChatParams,
} from "../ipc/ipc_types";
import * as git from "isomorphic-git";
import * as fs from "fs";
import { getDyadAppPath } from "../../../shared/lib/paths"
import {FileUploadsState} from "@/utils/file_uploads_state";
import { v4 as uuidv4 } from "uuid";
import { ipcMain, IpcMainInvokeEvent } from "electron";
import {
  ModelMessage,
  TextPart,
  ImagePart,
  streamText,
  ToolSet,
  TextStreamPart,
  stepCountIs,
  hasToolCall,
} from "ai";

import { db } from "../../db";
import { chats, messages } from "../../db/schema";
import { and, eq, isNull } from "drizzle-orm";
import {
  constructSystemPrompt,
  readAiRules,
} from "../../prompts/system_prompt";
import {
  SUPABASE_AVAILABLE_SYSTEM_PROMPT,
  SUPABASE_NOT_AVAILABLE_SYSTEM_PROMPT,
} from "../../prompts/supabase_prompt";
import { getDyadAppPath } from "../../../../shared/lib/paths";
import { readSettings } from "../../main/settings";
import type { ChatResponseEnd, ChatStreamParams } from "../ipc_types";
import { extractCodebase, readFileWithCache } from "../../utils/codebase";
import { processFullResponseActions } from "../utils/processors/response_processor";
import { streamTestResponse } from "./testing_chat_handlers";
import { getTestResponse } from "./testing_chat_handlers";
import { getModelClient, ModelClient } from "../utils/get_model_client";
import log from "electron-log";
import {
  getSupabaseContext,
  getSupabaseClientCode,
} from "../../supabase_admin/supabase_context";
import { SUMMARIZE_CHAT_SYSTEM_PROMPT } from "../../prompts/summarize_chat_system_prompt";
import fs from "node:fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import { readFile, writeFile, unlink } from "fs/promises";
import { getMaxTokens, getTemperature } from "../utils/token_utils";
import { MAX_CHAT_TURNS_IN_CONTEXT } from "@/constants/settings_constants";
import { validateChatContext } from "../utils/context_paths_utils";
import { GoogleGenerativeAIProviderOptions } from "@ai-sdk/google";
import { mcpServers } from "../../db/schema";
import { requireMcpToolConsent } from "../utils/mcp_consent";

import { getExtraProviderOptions } from "../utils/thinking_utils";

import { safeSend } from "../utils/safe_sender";
import { cleanFullResponse } from "../utils/cleanFullResponse";
import { generateProblemReport } from "../utils/processors/tsc";
import { createProblemFixPrompt } from "@/shared/problem_prompt";
import { AsyncVirtualFileSystem } from "../../../shared/VirtualFilesystem";
import {
  getDyadAddDependencyTags,
  getDyadWriteTags,
  getDyadDeleteTags,
  getDyadRenameTags,
} from "../utils/dyad_tag_parser";
import { fileExists } from "../utils/file_utils";
import { FileUploadsState } from "../utils/file_uploads_state";
import { OpenAIResponsesProviderOptions } from "@ai-sdk/openai";
import { extractMentionedAppsCodebases } from "../utils/mention_apps";
import { parseAppMentions } from "@/shared/parse_mention_apps";
import { prompts as promptsTable } from "../../db/schema";
import { inArray } from "drizzle-orm";
import { replacePromptReference } from "../utils/replacePromptReference";
import { mcpManager } from "../utils/mcp_manager";
import z from "zod";
import {isTextFile} from "@/utils/chat_utils"
const router = Router();

// Create a new chat
router.post("/", async (req, res) => {
  try {
    const { appId } = req.body;

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
        dir: getDyadAppPath(app.path),
        ref: "main",
      });
    } catch (error) {
      logger.error("Error getting git revision:", error);
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
      initialCommitHash
    );

    res.json({ chatId: chat.id });
  } catch (error) {
    logger.error("Error creating chat:", error);
    res.status(500).json({ error: "Failed to create chat" });
  }
});

// Get chat by ID
router.get("/:chatId", async (req, res) => {
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
      return res.status(404).json({ error: "Chat not found" });
    }

    res.json(chat);
  } catch (error) {
    logger.error("Error getting chat:", error);
    res.status(500).json({ error: "Failed to get chat" });
  }
});

// Get all chats for an app
router.get("/app/:appId", async (req, res) => {
  try {
    const appId = parseInt(req.params.appId);

    const query = appId
      ? db.query.chats.findMany({
          where: eq(chats.appId, appId),
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
    res.json(allChats);
  } catch (error) {
    logger.error("Error getting chats:", error);
    res.status(500).json({ error: "Failed to get chats" });
  }
});

// Search chats
router.get("/app/:appId/search/:query", async (req, res) => {
  try {
    const appId = parseInt(req.params.appId);
    const searchQuery = req.params.query;

    // 1) Find chats by title and map to ChatSearchResult with no matched message
    const chatTitleMatches = await db
      .select({
        id: chats.id,
        appId: chats.appId,
        title: chats.title,
        createdAt: chats.createdAt,
      })
      .from(chats)
      .where(and(eq(chats.appId, appId), like(chats.title, `%${searchQuery}%`)))
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
      .where(and(eq(chats.appId, appId), like(messages.content, `%${searchQuery}%`)))
      .orderBy(desc(chats.createdAt))
      .limit(10);

    // Combine: keep title matches and per-message matches
    const combined = [...titleResults, ...messageResults];
    const uniqueChats = Array.from(
      new Map(combined.map((item) => [item.id, item])).values()
    );

    // Sort newest chats first
    uniqueChats.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    res.json(uniqueChats);
  } catch (error) {
    logger.error("Error searching chats:", error);
    res.status(500).json({ error: "Failed to search chats" });
  }
});

// Update chat
router.put("/:chatId", async (req, res) => {
  try {
    const params: UpdateChatParams = {
      ...req.body,
      chatId: parseInt(req.params.chatId),
    };

    await db
      .update(chats)
      .set({ title: params.title })
      .where(eq(chats.id, params.chatId));

    res.json({ success: true });
  } catch (error) {
    logger.error("Error updating chat:", error);
    res.status(500).json({ error: "Failed to update chat" });
  }
});

// Delete chat
router.delete("/:chatId", async (req, res) => {
  try {
    const chatId = parseInt(req.params.chatId);
    await db.delete(chats).where(eq(chats.id, chatId));
    res.json({ success: true });
  } catch (error) {
    logger.error("Error deleting chat:", error);
    res.status(500).json({ error: "Failed to delete chat" });
  }
});

// Delete messages in a chat
router.delete("/:chatId/messages", async (req, res) => {
  try {
    const chatId = parseInt(req.params.chatId);
    await db.delete(messages).where(eq(messages.chatId, chatId));
    res.json({ success: true });
  } catch (error) {
    logger.error("Error deleting messages:", error);
    res.status(500).json({ error: "Failed to delete messages" });
  }
});

// Add dependency
router.post("/:chatId/dependencies", async (req, res) => {
  try {
    const chatId = parseInt(req.params.chatId);
    const { packages } = req.body;

    // Get chat and app info
    const chat = await db.query.chats.findFirst({
      where: eq(chats.id, chatId),
      with: { app: true },
    });

    if (!chat || !chat.app) {
      return res.status(404).json({ error: "Chat or app not found" });
    }

    // Create a system message for the dependency addition
    const [message] = await db
      .insert(messages)
      .values({
        chatId,
        content: `Installing dependencies: ${packages.join(", ")}`,
        role: "assistant",
      })
      .returning();

    // Execute add dependency in app path
    await executeAddDependency({
      packages,
      message,
      appPath: getDyadAppPath(chat.app.path),
    });

    res.json({ success: true });
  } catch (error) {
    logger.error("Error adding dependencies:", error);
    res.status(500).json({ error: "Failed to add dependencies" });
  }
});

// Get proposal
router.get("/:chatId/proposal", async (req, res) => {
  try {
    const chatId = parseInt(req.params.chatId);

    // Get the latest message in the chat that might have a proposal
    const latestMessage = await db.query.messages.findFirst({
      where: eq(messages.chatId, chatId),
      orderBy: [desc(messages.createdAt)],
    });

    if (!latestMessage) {
      return res.json({ proposal: null });
    }

    // Get chat and app info
    const chat = await db.query.chats.findFirst({
      where: eq(chats.id, chatId),
      with: { app: true },
    });

    if (!chat?.app) {
      return res.status(404).json({ error: "Chat or app not found" });
    }

    // Get the codebase path
    const appPath = getDyadAppPath(chat.app.path);

    // Get the file changes by parsing message content
    const writeTags = getDyadWriteTags(latestMessage.content);
    const deleteTags = getDyadDeleteTags(latestMessage.content);
    const renameTags = getDyadRenameTags(latestMessage.content);

    // Check if there are any proposed changes
    const hasChanges =
      writeTags.length > 0 || deleteTags.length > 0 || renameTags.length > 0;

    // Build proposal result
    const proposal = hasChanges
      ? {
          messageId: latestMessage.id,
          changes: {
            write: writeTags,
            delete: deleteTags,
            rename: renameTags,
          },
        }
      : null;

    res.json({ proposal });
  } catch (error) {
    logger.error("Error getting proposal:", error);
    res.status(500).json({ error: "Failed to get proposal" });
  }
});

// Approve proposal
router.post("/:chatId/messages/:messageId/approve", async (req, res) => {
  try {
    const chatId = parseInt(req.params.chatId);
    const messageId = parseInt(req.params.messageId);

    // Get message and chat info
    const message = await db.query.messages.findFirst({
      where: and(eq(messages.id, messageId), eq(messages.chatId, chatId)),
    });

    const chat = await db.query.chats.findFirst({
      where: eq(chats.id, chatId),
      with: { app: true },
    });

    if (!message || !chat?.app) {
      return res.status(404).json({ error: "Message or chat not found" });
    }

    // Process the full response actions
    const appPath = getDyadAppPath(chat.app.path);
    const response = await processFullResponseActions(message.content, messageId, {
      chatSummary: undefined,
      messageId,
    });

    if (response.error) {
      return res.status(400).json({ error: response.error });
    }

    // Create a commit for the changes
    await gitCommit({
      path: appPath,
      message: `Apply AI changes from chat ${chatId}`,
    });

    // Mark message as approved
    await db
      .update(messages)
      .set({ approvalState: "approved" })
      .where(eq(messages.id, messageId));

    res.json({ success: true });
  } catch (error) {
    logger.error("Error approving proposal:", error);
    res.status(500).json({ error: "Failed to approve proposal" });
  }
});

// Reject proposal
router.post("/:chatId/messages/:messageId/reject", async (req, res) => {
  try {
    const chatId = parseInt(req.params.chatId);
    const messageId = parseInt(req.params.messageId);

    // Get message info
    const message = await db.query.messages.findFirst({
      where: and(eq(messages.id, messageId), eq(messages.chatId, chatId)),
    });

    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    // Mark message as rejected
    await db
      .update(messages)
      .set({ approvalState: "rejected" })
      .where(eq(messages.id, messageId));

    res.json({ success: true });
  } catch (error) {
    logger.error("Error rejecting proposal:", error);
    res.status(500).json({ error: "Failed to reject proposal" });
  }
});




export default router;
