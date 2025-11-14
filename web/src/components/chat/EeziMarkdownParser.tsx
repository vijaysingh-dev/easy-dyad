import React, { useMemo } from "react";
import ReactMarkdown from "react-markdown";

import { EeziWrite } from "./EeziWrite";
import { EeziRename } from "./EeziRename";
import { EeziDelete } from "./EeziDelete";
import { EeziAddDependency } from "./EeziAddDependency";
import { EeziExecuteSql } from "./EeziExecuteSql";
import { EeziAddIntegration } from "./EeziAddIntegration";
import { EeziEdit } from "./EeziEdit";
import { EeziCodebaseContext } from "./EeziCodebaseContext";
import { EeziThink } from "./EeziThink";
import { CodeHighlight } from "./CodeHighlight";
import { useAtomValue } from "jotai";
import { isStreamingByIdAtom, selectedChatIdAtom } from "@/atoms/chatAtoms";
import { CustomTagState } from "./stateTypes";
import { EeziOutput } from "./EeziOutput";
import { EeziProblemSummary } from "./EeziProblemSummary";
import { EeziMcpToolCall } from "./EeziMcpToolCall";
import { EeziMcpToolResult } from "./EeziMcpToolResult";
import { EeziWebSearchResult } from "./EeziWebSearchResult";
import { EeziWebSearch } from "./EeziWebSearch";
import { EeziRead } from "./EeziRead";
import { mapActionToButton } from "./ChatInput";
import { SuggestedAction } from "@/shared/schemas";
import api from "@/api";

interface EeziMarkdownParserProps {
  content: string;
}

type CustomTagInfo = {
  tag: string;
  attributes: Record<string, string>;
  content: string;
  fullMatch: string;
  inProgress?: boolean;
};

type ContentPiece =
  | { type: "markdown"; content: string }
  | { type: "custom-tag"; tagInfo: CustomTagInfo };

const customLink = ({ node: _node, ...props }: { node?: any; [key: string]: any }) => (
  <a
    {...props}
    onClick={(e) => {
      const url = props.href;
      if (url) {
        e.preventDefault();
        api.app.openExternalUrl(url);
      }
    }}
  />
);

export const VanillaMarkdownParser = ({ content }: { content: string }) => {
  return (
    <ReactMarkdown
      components={{
        code: CodeHighlight,
        a: customLink,
      }}
    >
      {content}
    </ReactMarkdown>
  );
};

/**
 * Custom component to parse markdown content with Eezi-specific tags
 */
export const EeziMarkdownParser: React.FC<EeziMarkdownParserProps> = ({ content }) => {
  const chatId = useAtomValue(selectedChatIdAtom);
  const isStreaming = useAtomValue(isStreamingByIdAtom).get(chatId!) ?? false;
  // Extract content pieces (markdown and custom tags)
  const contentPieces = useMemo(() => {
    return parseCustomTags(content);
  }, [content]);

  return (
    <>
      {contentPieces.map((piece, index) => (
        <React.Fragment key={index}>
          {piece.type === "markdown"
            ? piece.content && (
                <ReactMarkdown
                  components={{
                    code: CodeHighlight,
                    a: customLink,
                  }}
                >
                  {piece.content}
                </ReactMarkdown>
              )
            : renderCustomTag(piece.tagInfo, {
                index,
                isStreaming,
              })}
        </React.Fragment>
      ))}
    </>
  );
};

/**
 * Pre-process content to handle unclosed custom tags
 * Adds closing tags at the end of the content for any unclosed custom tags
 * Assumes the opening tags are complete and valid
 * Returns the processed content and a map of in-progress tags
 */
function preprocessUnclosedTags(content: string): {
  processedContent: string;
  inProgressTags: Map<string, Set<number>>;
} {
  const customTagNames = [
    "eezi-write",
    "eezi-rename",
    "eezi-delete",
    "eezi-add-dependency",
    "eezi-execute-sql",
    "eezi-add-integration",
    "eezi-output",
    "eezi-problem-report",
    "eezi-chat-summary",
    "eezi-edit",
    "eezi-codebase-context",
    "eezi-web-search-result",
    "eezi-web-search",
    "eezi-read",
    "think",
    "eezi-command",
    "eezi-mcp-tool-call",
    "eezi-mcp-tool-result",
  ];

  let processedContent = content;
  // Map to track which tags are in progress and their positions
  const inProgressTags = new Map<string, Set<number>>();

  // For each tag type, check if there are unclosed tags
  for (const tagName of customTagNames) {
    // Count opening and closing tags
    const openTagPattern = new RegExp(`<${tagName}(?:\\s[^>]*)?>`, "g");
    const closeTagPattern = new RegExp(`</${tagName}>`, "g");

    // Track the positions of opening tags
    const openingMatches: RegExpExecArray[] = [];
    let match;

    // Reset regex lastIndex to start from the beginning
    openTagPattern.lastIndex = 0;

    while ((match = openTagPattern.exec(processedContent)) !== null) {
      openingMatches.push({ ...match });
    }

    const openCount = openingMatches.length;
    const closeCount = (processedContent.match(closeTagPattern) || []).length;

    // If we have more opening than closing tags
    const missingCloseTags = openCount - closeCount;
    if (missingCloseTags > 0) {
      // Add the required number of closing tags at the end
      processedContent += Array(missingCloseTags).fill(`</${tagName}>`).join("");

      // Mark the last N tags as in progress where N is the number of missing closing tags
      const inProgressIndexes = new Set<number>();
      const startIndex = openCount - missingCloseTags;
      for (let i = startIndex; i < openCount; i++) {
        inProgressIndexes.add(openingMatches[i].index);
      }
      inProgressTags.set(tagName, inProgressIndexes);
    }
  }

  return { processedContent, inProgressTags };
}

/**
 * Parse the content to extract custom tags and markdown sections into a unified array
 */
function parseCustomTags(content: string): ContentPiece[] {
  const { processedContent, inProgressTags } = preprocessUnclosedTags(content);

  const customTagNames = [
    "eezi-write",
    "eezi-rename",
    "eezi-delete",
    "eezi-add-dependency",
    "eezi-execute-sql",
    "eezi-add-integration",
    "eezi-output",
    "eezi-problem-report",
    "eezi-chat-summary",
    "eezi-edit",
    "eezi-codebase-context",
    "eezi-web-search-result",
    "eezi-web-search",
    "eezi-read",
    "think",
    "eezi-command",
    "eezi-mcp-tool-call",
    "eezi-mcp-tool-result",
  ];

  const tagPattern = new RegExp(
    `<(${customTagNames.join("|")})\\s*([^>]*)>(.*?)<\\/\\1>`,
    "gs"
  );

  const contentPieces: ContentPiece[] = [];
  let lastIndex = 0;
  let match;

  // Find all custom tags
  while ((match = tagPattern.exec(processedContent)) !== null) {
    const [fullMatch, tag, attributesStr, tagContent] = match;
    const startIndex = match.index;

    // Add the markdown content before this tag
    if (startIndex > lastIndex) {
      contentPieces.push({
        type: "markdown",
        content: processedContent.substring(lastIndex, startIndex),
      });
    }

    // Parse attributes
    const attributes: Record<string, string> = {};
    const attrPattern = /(\w+)="([^"]*)"/g;
    let attrMatch;
    while ((attrMatch = attrPattern.exec(attributesStr)) !== null) {
      attributes[attrMatch[1]] = attrMatch[2];
    }

    // Check if this tag was marked as in progress
    const tagInProgressSet = inProgressTags.get(tag);
    const isInProgress = tagInProgressSet?.has(startIndex);

    // Add the tag info
    contentPieces.push({
      type: "custom-tag",
      tagInfo: {
        tag,
        attributes,
        content: tagContent,
        fullMatch,
        inProgress: isInProgress || false,
      },
    });

    lastIndex = startIndex + fullMatch.length;
  }

  // Add the remaining markdown content
  if (lastIndex < processedContent.length) {
    contentPieces.push({
      type: "markdown",
      content: processedContent.substring(lastIndex),
    });
  }

  return contentPieces;
}

function getState({
  isStreaming,
  inProgress,
}: {
  isStreaming?: boolean;
  inProgress?: boolean;
}): CustomTagState {
  if (!inProgress) {
    return "finished";
  }
  return isStreaming ? "pending" : "aborted";
}

/**
 * Render a custom tag based on its type
 */
function renderCustomTag(
  tagInfo: CustomTagInfo,
  { index, isStreaming }: { index: number; isStreaming: boolean }
): React.ReactNode {
  const { tag, attributes, content, inProgress } = tagInfo;

  switch (tag) {
    case "eezi-read":
      return (
        <EeziRead
          node={{
            properties: {
              path: attributes.path || "",
            },
          }}
        >
          {content}
        </EeziRead>
      );
    case "eezi-web-search":
      return (
        <EeziWebSearch
          node={{
            properties: {},
          }}
        >
          {content}
        </EeziWebSearch>
      );
    case "eezi-web-search-result":
      return (
        <EeziWebSearchResult
          node={{
            properties: {
              state: getState({ isStreaming, inProgress }),
            },
          }}
        >
          {content}
        </EeziWebSearchResult>
      );
    case "think":
      return (
        <EeziThink
          node={{
            properties: {
              state: getState({ isStreaming, inProgress }),
            },
          }}
        >
          {content}
        </EeziThink>
      );
    case "eezi-write":
      return (
        <EeziWrite
          node={{
            properties: {
              path: attributes.path || "",
              description: attributes.description || "",
              state: getState({ isStreaming, inProgress }),
            },
          }}
        >
          {content}
        </EeziWrite>
      );

    case "eezi-rename":
      return (
        <EeziRename
          node={{
            properties: {
              from: attributes.from || "",
              to: attributes.to || "",
            },
          }}
        >
          {content}
        </EeziRename>
      );

    case "eezi-delete":
      return (
        <EeziDelete
          node={{
            properties: {
              path: attributes.path || "",
            },
          }}
        >
          {content}
        </EeziDelete>
      );

    case "eezi-add-dependency":
      return (
        <EeziAddDependency
          node={{
            properties: {
              packages: attributes.packages || "",
            },
          }}
        >
          {content}
        </EeziAddDependency>
      );

    case "eezi-execute-sql":
      return (
        <EeziExecuteSql
          node={{
            properties: {
              state: getState({ isStreaming, inProgress }),
              description: attributes.description || "",
            },
          }}
        >
          {content}
        </EeziExecuteSql>
      );

    case "eezi-add-integration":
      return (
        <EeziAddIntegration
          node={{
            properties: {
              provider: attributes.provider || "",
            },
          }}
        >
          {content}
        </EeziAddIntegration>
      );

    case "eezi-edit":
      return (
        <EeziEdit
          node={{
            properties: {
              path: attributes.path || "",
              description: attributes.description || "",
              state: getState({ isStreaming, inProgress }),
            },
          }}
        >
          {content}
        </EeziEdit>
      );

    case "eezi-codebase-context":
      return (
        <EeziCodebaseContext
          node={{
            properties: {
              files: attributes.files || "",
              state: getState({ isStreaming, inProgress }),
            },
          }}
        >
          {content}
        </EeziCodebaseContext>
      );

    case "eezi-mcp-tool-call":
      return (
        <EeziMcpToolCall
          node={{
            properties: {
              serverName: attributes.server || "",
              toolName: attributes.tool || "",
            },
          }}
        >
          {content}
        </EeziMcpToolCall>
      );

    case "eezi-mcp-tool-result":
      return (
        <EeziMcpToolResult
          node={{
            properties: {
              serverName: attributes.server || "",
              toolName: attributes.tool || "",
            },
          }}
        >
          {content}
        </EeziMcpToolResult>
      );

    case "eezi-output":
      return (
        <EeziOutput
          type={attributes.type as "warning" | "error"}
          message={attributes.message}
        >
          {content}
        </EeziOutput>
      );

    case "eezi-problem-report":
      return (
        <EeziProblemSummary summary={attributes.summary}>{content}</EeziProblemSummary>
      );

    case "eezi-chat-summary":
      // Don't render anything for eezi-chat-summary
      return null;

    case "eezi-command":
      if (attributes.type) {
        const action = {
          id: attributes.type,
        } as SuggestedAction;
        return <>{mapActionToButton(action, index)}</>;
      }
      return null;

    default:
      return null;
  }
}
