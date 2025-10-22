import logger from "@/logger";
import db from "@/db";
import { mcpServers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Response } from "express";
import { ModelMessage, TextPart, ImagePart, ToolSet, TextStreamPart } from "ai";
import * as path from "path";
import { readFile } from "fs/promises";

import { requireMcpToolConsent } from "./mcp_consent";
import { safeSend } from "./safe_sender";
import { cleanFullResponse } from "./cleanFullResponse";
import { mcpManager } from "./mcp_manager";

type AsyncIterableStream<T> = AsyncIterable<T> & ReadableStream<T>;

// Common helper export  functions
const TEXT_FILE_EXTENSIONS = [
  ".md",
  ".txt",
  ".json",
  ".csv",
  ".js",
  ".ts",
  ".html",
  ".css",
];

export async function isTextFile(filePath: string): Promise<boolean> {
  const ext = path.extname(filePath).toLowerCase();
  return TEXT_FILE_EXTENSIONS.includes(ext);
}

export function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Safely parse an MCP tool key that combines server and tool names.
// We split on the LAST occurrence of "__" to avoid ambiguity if either
// side contains "__" as part of its sanitized name.
export function parseMcpToolKey(toolKey: string): {
  serverName: string;
  toolName: string;
} {
  const separator = "__";
  const lastIndex = toolKey.lastIndexOf(separator);
  if (lastIndex === -1) {
    return { serverName: "", toolName: toolKey };
  }
  const serverName = toolKey.slice(0, lastIndex);
  const toolName = toolKey.slice(lastIndex + separator.length);
  return { serverName, toolName };
}

// Helper function to process stream chunks
export async function processStreamChunks({
  fullStream,
  fullResponse,
  abortController,
  chatId,
  processResponseChunkUpdate,
}: {
  fullStream: AsyncIterableStream<TextStreamPart<ToolSet>>;
  fullResponse: string;
  abortController: AbortController;
  chatId: number;
  processResponseChunkUpdate: (params: { fullResponse: string }) => Promise<string>;
}): Promise<{ fullResponse: string; incrementalResponse: string }> {
  let incrementalResponse = "";
  let inThinkingBlock = false;

  for await (const part of fullStream) {
    let chunk = "";
    if (
      inThinkingBlock &&
      !["reasoning-delta", "reasoning-end", "reasoning-start"].includes(part.type)
    ) {
      chunk = "</think>";
      inThinkingBlock = false;
    }
    if (part.type === "text-delta") {
      chunk += part.text;
    } else if (part.type === "reasoning-delta") {
      if (!inThinkingBlock) {
        chunk = "<think>";
        inThinkingBlock = true;
      }

      chunk += escapeDyadTags(part.text);
    } else if (part.type === "tool-call") {
      const { serverName, toolName } = parseMcpToolKey(part.toolName);
      const content = escapeDyadTags(JSON.stringify(part.input));
      chunk = `<dyad-mcp-tool-call server="${serverName}" tool="${toolName}">\n${content}\n</dyad-mcp-tool-call>\n`;
    } else if (part.type === "tool-result") {
      const { serverName, toolName } = parseMcpToolKey(part.toolName);
      const content = escapeDyadTags(part.output);
      chunk = `<dyad-mcp-tool-result server="${serverName}" tool="${toolName}">\n${content}\n</dyad-mcp-tool-result>\n`;
    }

    if (!chunk) {
      continue;
    }

    fullResponse += chunk;
    incrementalResponse += chunk;
    fullResponse = cleanFullResponse(fullResponse);
    fullResponse = await processResponseChunkUpdate({
      fullResponse,
    });

    // If the stream was aborted, exit early
    if (abortController.signal.aborted) {
      logger.log(`Stream for chat ${chatId} was aborted`);
      break;
    }
  }

  return { fullResponse, incrementalResponse };
}

export function formatMessagesForSummary(
  messages: { role: string; content: string | undefined }[]
) {
  if (messages.length <= 8) {
    // If we have 8 or fewer messages, include all of them
    return messages
      .map((m) => `<message role="${m.role}">${m.content}</message>`)
      .join("\n");
  }

  // Take first 2 messages and last 6 messages
  const firstMessages = messages.slice(0, 2);
  const lastMessages = messages.slice(-6);

  // Combine them with an indicator of skipped messages
  const combinedMessages = [
    ...firstMessages,
    {
      role: "system",
      content: `[... ${messages.length - 8} messages omitted ...]`,
    },
    ...lastMessages,
  ];

  return combinedMessages
    .map((m) => `<message role="${m.role}">${m.content}</message>`)
    .join("\n");
}

// Helper function to replace text attachment placeholders with full content
export async function replaceTextAttachmentWithContent(
  text: string,
  filePath: string,
  fileName: string
): Promise<string> {
  try {
    if (await isTextFile(filePath)) {
      // Read the full content
      const fullContent = await readFile(filePath, "utf-8");

      // Replace the placeholder tag with the full content
      const escapedPath = filePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const tagPattern = new RegExp(
        `<dyad-text-attachment filename="[^"]*" type="[^"]*" path="${escapedPath}">\\s*<\\/dyad-text-attachment>`,
        "g"
      );

      const replacedText = text.replace(
        tagPattern,
        `Full content of ${fileName}:\n\`\`\`\n${fullContent}\n\`\`\``
      );

      logger.log(
        `Replaced text attachment content for: ${fileName} - length before: ${text.length} - length after: ${replacedText.length}`
      );
      return replacedText;
    }
    return text;
  } catch (error) {
    logger.error(`Error processing text file: ${error}`);
    return text;
  }
}

// Helper function to convert traditional message to one with proper image attachments
export async function prepareMessageWithAttachments(
  message: ModelMessage,
  attachmentPaths: string[]
): Promise<ModelMessage> {
  let textContent = message.content;
  // Get the original text content
  if (typeof textContent !== "string") {
    logger.warn(
      "Message content is not a string - shouldn't happen but using message as-is"
    );
    return message;
  }

  // Process text file attachments - replace placeholder tags with full content
  for (const filePath of attachmentPaths) {
    const fileName = path.basename(filePath);
    textContent = await replaceTextAttachmentWithContent(
      textContent,
      filePath,
      fileName
    );
  }

  // For user messages with attachments, create a content array
  const contentParts: (TextPart | ImagePart)[] = [];

  // Add the text part first with possibly modified content
  contentParts.push({
    type: "text",
    text: textContent,
  });

  // Add image parts for any image attachments
  for (const filePath of attachmentPaths) {
    const ext = path.extname(filePath).toLowerCase();
    if ([".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(ext)) {
      try {
        // Read the file as a buffer
        const imageBuffer = await readFile(filePath);

        // Add the image to the content parts
        contentParts.push({
          type: "image",
          image: imageBuffer,
        });

        logger.log(`Added image attachment: ${filePath}`);
      } catch (error) {
        logger.error(`Error reading image file: ${error}`);
      }
    }
  }

  // Return the message with the content array
  return {
    role: "user",
    content: contentParts,
  };
}

export function removeNonEssentialTags(text: string): string {
  return removeProblemReportTags(removeThinkingTags(text));
}

export function removeThinkingTags(text: string): string {
  const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
  return text.replace(thinkRegex, "").trim();
}

export function removeProblemReportTags(text: string): string {
  const problemReportRegex =
    /<dyad-problem-report[^>]*>[\s\S]*?<\/dyad-problem-report>/g;
  return text.replace(problemReportRegex, "").trim();
}

export function removeDyadTags(text: string): string {
  const dyadRegex = /<dyad-[^>]*>[\s\S]*?<\/dyad-[^>]*>/g;
  return text.replace(dyadRegex, "").trim();
}

export function hasUnclosedDyadWrite(text: string): boolean {
  // Find the last opening dyad-write tag
  const openRegex = /<dyad-write[^>]*>/g;
  let lastOpenIndex = -1;
  let match;

  while ((match = openRegex.exec(text)) !== null) {
    lastOpenIndex = match.index;
  }

  // If no opening tag found, there's nothing unclosed
  if (lastOpenIndex === -1) {
    return false;
  }

  // Look for a closing tag after the last opening tag
  const textAfterLastOpen = text.substring(lastOpenIndex);
  const hasClosingTag = /<\/dyad-write>/.test(textAfterLastOpen);

  return !hasClosingTag;
}

export function escapeDyadTags(text: string): string {
  // Escape dyad tags in reasoning content
  // We are replacing the opening tag with a look-alike character
  // to avoid issues where thinking content includes dyad tags
  // and are mishandled by:
  // 1. FE markdown parser
  // 2. Main process response processor
  return text.replace(/<dyad/g, "＜dyad").replace(/<\/dyad/g, "＜/dyad");
}

export function createOtherAppsCodebasePrompt(otherAppsCodebaseInfo: string): string {
  return `
# Referenced Apps

These are the other apps that I've mentioned in my prompt. These other apps' codebases are READ-ONLY.

${otherAppsCodebaseInfo}
`;
}

export async function getMcpTools(
  expressResponse: Response,
  chatId: number
): Promise<ToolSet> {
  const mcpToolSet: ToolSet = {};
  try {
    const servers = await db
      .select()
      .from(mcpServers)
      .where(eq(mcpServers.enabled, true as any));
    for (const s of servers) {
      const client = await mcpManager.getClient(s.id);
      const toolSet = await client.tools();
      for (const [name, tool] of Object.entries(toolSet)) {
        const key = `${String(s.name || "").replace(/[^a-zA-Z0-9_-]/g, "-")}__${String(name).replace(/[^a-zA-Z0-9_-]/g, "-")}`;
        const original = tool;
        mcpToolSet[key] = {
          description: original?.description,
          inputSchema: original?.inputSchema,
          execute: async (args: any, execCtx: any) => {
            const inputPreview =
              typeof args === "string"
                ? args
                : Array.isArray(args)
                  ? args.join(" ")
                  : JSON.stringify(args).slice(0, 500);
            const ok = await requireMcpToolConsent(expressResponse, chatId, {
              serverId: s.id,
              serverName: s.name,
              toolName: name,
              toolDescription: original?.description,
              inputPreview,
            });

            if (!ok) throw new Error(`User declined running tool ${key}`);
            const res = await original.execute?.(args, execCtx);

            return typeof res === "string" ? res : JSON.stringify(res);
          },
        };
      }
    }
  } catch (e) {
    logger.warn("Failed building MCP toolset", e);
  }
  return mcpToolSet;
}

// e.g. [dyad-qa=add-dep]
// Canned responses for test prompts
const TEST_RESPONSES: Record<string, string> = {
  "ts-error": `This will get a TypeScript error.

  <dyad-write path="src/bad-file.ts" description="This will get a TypeScript error.">
  import NonExistentClass from 'non-existent-class';

  const x = new Object();
  x.nonExistentMethod();
  </dyad-write>

  EOM`,
  "add-dep": `I'll add that dependency for you.

  <dyad-add-dependency packages="deno"></dyad-add-dependency>

  EOM`,
  "add-non-existing-dep": `I'll add that dependency for you.

  <dyad-add-dependency packages="@angular/does-not-exist"></dyad-add-dependency>

  EOM`,
  "add-multiple-deps": `I'll add that dependency for you.

  <dyad-add-dependency packages="react-router-dom react-query"></dyad-add-dependency>

  EOM`,
  write: `Hello world
  <dyad-write path="src/hello.ts" content="Hello world">
  console.log("Hello world");
  </dyad-write>
  EOM`,
  "string-literal-leak": `BEFORE TAG
  <dyad-write path="src/pages/locations/neighborhoods/louisville/Highlands.tsx" description="Updating Highlands neighborhood page to use <a> tags.">
import React from 'react';
</dyad-write>
AFTER TAG
`,
};

/**
 * Checks if a prompt is a test prompt and returns the corresponding canned response
 * @param prompt The user prompt
 * @returns The canned response if it's a test prompt, null otherwise
 */
export function getTestResponse(prompt: string): string | null {
  const match = prompt.match(/\[dyad-qa=([^\]]+)\]/);
  if (match) {
    const testKey = match[1];
    return TEST_RESPONSES[testKey] || null;
  }
  return null;
}

/**
 * Streams a canned test response to the client
 * @param event The IPC event
 * @param chatId The chat ID
 * @param testResponse The canned response to stream
 * @param abortController The abort controller for this stream
 * @param updatedChat The chat data with messages
 * @returns The full streamed response
 */
export async function streamTestResponse(
  res: Response,
  chatId: number,
  testResponse: string,
  abortController: AbortController,
  updatedChat: any
): Promise<string> {
  console.log(`Using canned response for test prompt`);

  // Simulate streaming by splitting the response into chunks
  const chunks = testResponse.split(" ");
  let fullResponse = "";

  for (const chunk of chunks) {
    // Skip processing if aborted
    if (abortController.signal.aborted) {
      break;
    }

    // Add the word plus a space
    fullResponse += chunk + " ";
    fullResponse = cleanFullResponse(fullResponse);

    // Send the current accumulated response
    safeSend(res, "chat:response:chunk", {
      chatId,
      messages: [
        ...updatedChat.messages,
        {
          role: "assistant",
          content: fullResponse,
        },
      ],
    });

    // Add a small delay to simulate streaming
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  return fullResponse;
}
