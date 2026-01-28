import React, { useMemo } from "react";
import ReactMarkdown from "react-markdown";

import { EasyWrite } from "./EasyWrite";
import { EasyRename } from "./EasyRename";
import { EasyDelete } from "./EasyDelete";
import { EasyAddDependency } from "./EasyAddDependency";
import { EasyExecuteSql } from "./EasyExecuteSql";
import { EasyAddIntegration } from "./EasyAddIntegration";
import { EasyEdit } from "./EasyEdit";
import { EasyCodebaseContext } from "./EasyCodebaseContext";
import { EasyThink } from "./EasyThink";
import { CodeHighlight } from "./CodeHighlight";
import { useAtomValue } from "jotai";
import { isStreamingByIdAtom, selectedChatIdAtom } from "@/atoms/chatAtoms";
import { CustomTagState } from "./stateTypes";
import { EasyOutput } from "./EasyOutput";
import { EasyProblemSummary } from "./EasyProblemSummary";
import { EasyMcpToolCall } from "./EasyMcpToolCall";
import { EasyMcpToolResult } from "./EasyMcpToolResult";
import { EasyWebSearchResult } from "./EasyWebSearchResult";
import { EasyWebSearch } from "./EasyWebSearch";
import { EasyRead } from "./EasyRead";
import { mapActionToButton } from "./ChatInput";
import { SuggestedAction } from "@/shared/schemas";
import api from "@/api";

interface EasyMarkdownParserProps {
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
 * Custom component to parse markdown content with Easy Dyad-specific tags
 */
export const EasyMarkdownParser: React.FC<EasyMarkdownParserProps> = ({ content }) => {
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
    "easy-write",
    "easy-rename",
    "easy-delete",
    "easy-add-dependency",
    "easy-execute-sql",
    "easy-add-integration",
    "easy-output",
    "easy-problem-report",
    "easy-chat-summary",
    "easy-edit",
    "easy-codebase-context",
    "easy-web-search-result",
    "easy-web-search",
    "easy-read",
    "think",
    "easy-command",
    "easy-mcp-tool-call",
    "easy-mcp-tool-result",
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
    "easy-write",
    "easy-rename",
    "easy-delete",
    "easy-add-dependency",
    "easy-execute-sql",
    "easy-add-integration",
    "easy-output",
    "easy-problem-report",
    "easy-chat-summary",
    "easy-edit",
    "easy-codebase-context",
    "easy-web-search-result",
    "easy-web-search",
    "easy-read",
    "think",
    "easy-command",
    "easy-mcp-tool-call",
    "easy-mcp-tool-result",
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
    case "easy-read":
      return (
        <EasyRead
          node={{
            properties: {
              path: attributes.path || "",
            },
          }}
        >
          {content}
        </EasyRead>
      );
    case "easy-web-search":
      return (
        <EasyWebSearch
          node={{
            properties: {},
          }}
        >
          {content}
        </EasyWebSearch>
      );
    case "easy-web-search-result":
      return (
        <EasyWebSearchResult
          node={{
            properties: {
              state: getState({ isStreaming, inProgress }),
            },
          }}
        >
          {content}
        </EasyWebSearchResult>
      );
    case "think":
      return (
        <EasyThink
          node={{
            properties: {
              state: getState({ isStreaming, inProgress }),
            },
          }}
        >
          {content}
        </EasyThink>
      );
    case "easy-write":
      return (
        <EasyWrite
          node={{
            properties: {
              path: attributes.path || "",
              description: attributes.description || "",
              state: getState({ isStreaming, inProgress }),
            },
          }}
        >
          {content}
        </EasyWrite>
      );

    case "easy-rename":
      return (
        <EasyRename
          node={{
            properties: {
              from: attributes.from || "",
              to: attributes.to || "",
            },
          }}
        >
          {content}
        </EasyRename>
      );

    case "easy-delete":
      return (
        <EasyDelete
          node={{
            properties: {
              path: attributes.path || "",
            },
          }}
        >
          {content}
        </EasyDelete>
      );

    case "easy-add-dependency":
      return (
        <EasyAddDependency
          node={{
            properties: {
              packages: attributes.packages || "",
            },
          }}
        >
          {content}
        </EasyAddDependency>
      );

    case "easy-execute-sql":
      return (
        <EasyExecuteSql
          node={{
            properties: {
              state: getState({ isStreaming, inProgress }),
              description: attributes.description || "",
            },
          }}
        >
          {content}
        </EasyExecuteSql>
      );

    case "easy-add-integration":
      return (
        <EasyAddIntegration
          node={{
            properties: {
              provider: attributes.provider || "",
            },
          }}
        >
          {content}
        </EasyAddIntegration>
      );

    case "easy-edit":
      return (
        <EasyEdit
          node={{
            properties: {
              path: attributes.path || "",
              description: attributes.description || "",
              state: getState({ isStreaming, inProgress }),
            },
          }}
        >
          {content}
        </EasyEdit>
      );

    case "easy-codebase-context":
      return (
        <EasyCodebaseContext
          node={{
            properties: {
              files: attributes.files || "",
              state: getState({ isStreaming, inProgress }),
            },
          }}
        >
          {content}
        </EasyCodebaseContext>
      );

    case "easy-mcp-tool-call":
      return (
        <EasyMcpToolCall
          node={{
            properties: {
              serverName: attributes.server || "",
              toolName: attributes.tool || "",
            },
          }}
        >
          {content}
        </EasyMcpToolCall>
      );

    case "easy-mcp-tool-result":
      return (
        <EasyMcpToolResult
          node={{
            properties: {
              serverName: attributes.server || "",
              toolName: attributes.tool || "",
            },
          }}
        >
          {content}
        </EasyMcpToolResult>
      );

    case "easy-output":
      return (
        <EasyOutput
          type={attributes.type as "warning" | "error"}
          message={attributes.message}
        >
          {content}
        </EasyOutput>
      );

    case "easy-problem-report":
      return (
        <EasyProblemSummary summary={attributes.summary}>{content}</EasyProblemSummary>
      );

    case "easy-chat-summary":
      // Don't render anything for easy-chat-summary
      return null;

    case "easy-command":
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
