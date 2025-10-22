import logger from "@/logger";
import { normalizePath } from "@/services/paths";
import { SqlQuery } from "@shared/schemas";

export function getEeziWriteTags(fullResponse: string): {
  path: string;
  content: string;
  description?: string;
}[] {
  const eeziWriteRegex = /<eezi-write([^>]*)>([\s\S]*?)<\/eezi-write>/gi;
  const pathRegex = /path="([^"]+)"/;
  const descriptionRegex = /description="([^"]+)"/;

  let match;
  const tags: { path: string; content: string; description?: string }[] = [];

  while ((match = eeziWriteRegex.exec(fullResponse)) !== null) {
    const attributesString = match[1];
    let content = match[2].trim();

    const pathMatch = pathRegex.exec(attributesString);
    const descriptionMatch = descriptionRegex.exec(attributesString);

    if (pathMatch && pathMatch[1]) {
      const path = pathMatch[1];
      const description = descriptionMatch?.[1];

      const contentLines = content.split("\n");
      if (contentLines[0]?.startsWith("```")) {
        contentLines.shift();
      }
      if (contentLines[contentLines.length - 1]?.startsWith("```")) {
        contentLines.pop();
      }
      content = contentLines.join("\n");

      tags.push({ path: normalizePath(path), content, description });
    } else {
      logger.warn("Found <eezi-write> tag without a valid 'path' attribute:", match[0]);
    }
  }
  return tags;
}

export function getEeziRenameTags(fullResponse: string): {
  from: string;
  to: string;
}[] {
  const eeziRenameRegex =
    /<eezi-rename from="([^"]+)" to="([^"]+)"[^>]*>([\s\S]*?)<\/eezi-rename>/g;
  let match;
  const tags: { from: string; to: string }[] = [];
  while ((match = eeziRenameRegex.exec(fullResponse)) !== null) {
    tags.push({
      from: normalizePath(match[1]),
      to: normalizePath(match[2]),
    });
  }
  return tags;
}

export function getEeziDeleteTags(fullResponse: string): string[] {
  const eeziDeleteRegex = /<eezi-delete path="([^"]+)"[^>]*>([\s\S]*?)<\/eezi-delete>/g;
  let match;
  const paths: string[] = [];
  while ((match = eeziDeleteRegex.exec(fullResponse)) !== null) {
    paths.push(normalizePath(match[1]));
  }
  return paths;
}

export function getEeziAddDependencyTags(fullResponse: string): string[] {
  const eeziAddDependencyRegex =
    /<eezi-add-dependency packages="([^"]+)">[^<]*<\/eezi-add-dependency>/g;
  let match;
  const packages: string[] = [];
  while ((match = eeziAddDependencyRegex.exec(fullResponse)) !== null) {
    packages.push(...match[1].split(" "));
  }
  return packages;
}

export function getEeziChatSummaryTag(fullResponse: string): string | null {
  const eeziChatSummaryRegex = /<eezi-chat-summary>([\s\S]*?)<\/eezi-chat-summary>/g;
  const match = eeziChatSummaryRegex.exec(fullResponse);
  if (match && match[1]) {
    return match[1].trim();
  }
  return null;
}

export function getEeziExecuteSqlTags(fullResponse: string): SqlQuery[] {
  const eeziExecuteSqlRegex = /<eezi-execute-sql([^>]*)>([\s\S]*?)<\/eezi-execute-sql>/g;
  const descriptionRegex = /description="([^"]+)"/;
  let match;
  const queries: { content: string; description?: string }[] = [];

  while ((match = eeziExecuteSqlRegex.exec(fullResponse)) !== null) {
    const attributesString = match[1] || "";
    let content = match[2].trim();
    const descriptionMatch = descriptionRegex.exec(attributesString);
    const description = descriptionMatch?.[1];

    // Handle markdown code blocks if present
    const contentLines = content.split("\n");
    if (contentLines[0]?.startsWith("```")) {
      contentLines.shift();
    }
    if (contentLines[contentLines.length - 1]?.startsWith("```")) {
      contentLines.pop();
    }
    content = contentLines.join("\n");

    queries.push({ content, description });
  }

  return queries;
}

export function getEeziCommandTags(fullResponse: string): string[] {
  const eeziCommandRegex = /<eezi-command type="([^"]+)"[^>]*><\/eezi-command>/g;
  let match;
  const commands: string[] = [];

  while ((match = eeziCommandRegex.exec(fullResponse)) !== null) {
    commands.push(match[1]);
  }

  return commands;
}
