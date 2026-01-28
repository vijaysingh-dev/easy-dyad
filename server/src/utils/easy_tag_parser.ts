import logger from "@/logger";
import { normalizePath } from "@/paths";
import { SqlQuery } from "@/shared/schemas";

export function getEasyWriteTags(fullResponse: string): {
  path: string;
  content: string;
  description?: string;
}[] {
  const easyWriteRegex = /<easy-write([^>]*)>([\s\S]*?)<\/easy-write>/gi;
  const pathRegex = /path="([^"]+)"/;
  const descriptionRegex = /description="([^"]+)"/;

  let match;
  const tags: { path: string; content: string; description?: string }[] = [];

  while ((match = easyWriteRegex.exec(fullResponse)) !== null) {
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
      logger.warn("Found <easy-write> tag without a valid 'path' attribute:", match[0]);
    }
  }
  return tags;
}

export function getEasyRenameTags(fullResponse: string): {
  from: string;
  to: string;
}[] {
  const easyRenameRegex =
    /<easy-rename from="([^"]+)" to="([^"]+)"[^>]*>([\s\S]*?)<\/easy-rename>/g;
  let match;
  const tags: { from: string; to: string }[] = [];
  while ((match = easyRenameRegex.exec(fullResponse)) !== null) {
    tags.push({
      from: normalizePath(match[1]),
      to: normalizePath(match[2]),
    });
  }
  return tags;
}

export function getEasyDeleteTags(fullResponse: string): string[] {
  const easyDeleteRegex = /<easy-delete path="([^"]+)"[^>]*>([\s\S]*?)<\/easy-delete>/g;
  let match;
  const paths: string[] = [];
  while ((match = easyDeleteRegex.exec(fullResponse)) !== null) {
    paths.push(normalizePath(match[1]));
  }
  return paths;
}

export function getEasyAddDependencyTags(fullResponse: string): string[] {
  const easyAddDependencyRegex =
    /<easy-add-dependency packages="([^"]+)">[^<]*<\/easy-add-dependency>/g;
  let match;
  const packages: string[] = [];
  while ((match = easyAddDependencyRegex.exec(fullResponse)) !== null) {
    packages.push(...match[1].split(" "));
  }
  return packages;
}

export function getEasyChatSummaryTag(fullResponse: string): string | null {
  const easyChatSummaryRegex = /<easy-chat-summary>([\s\S]*?)<\/easy-chat-summary>/g;
  const match = easyChatSummaryRegex.exec(fullResponse);
  if (match && match[1]) {
    return match[1].trim();
  }
  return null;
}

export function getEasyExecuteSqlTags(fullResponse: string): SqlQuery[] {
  const easyExecuteSqlRegex = /<easy-execute-sql([^>]*)>([\s\S]*?)<\/easy-execute-sql>/g;
  const descriptionRegex = /description="([^"]+)"/;
  let match;
  const queries: { content: string; description?: string }[] = [];

  while ((match = easyExecuteSqlRegex.exec(fullResponse)) !== null) {
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

export function getEasyCommandTags(fullResponse: string): string[] {
  const easyCommandRegex = /<easy-command type="([^"]+)"[^>]*><\/easy-command>/g;
  let match;
  const commands: string[] = [];

  while ((match = easyCommandRegex.exec(fullResponse)) !== null) {
    commands.push(match[1]);
  }

  return commands;
}
