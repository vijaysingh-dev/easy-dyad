import logger from "@/logger";
import { AppChatContext, AppChatContextSchema } from "@shared/schemas";

export function validateChatContext(chatContext: unknown): AppChatContext {
  if (!chatContext) {
    return {
      contextPaths: [],
      smartContextAutoIncludes: [],
      excludePaths: [],
    };
  }

  try {
    // Validate that the contextPaths data matches the expected schema
    return AppChatContextSchema.parse(chatContext);
  } catch (error: any) {
    logger.warn("Invalid contextPaths data:", error.message);
    // Return empty array as fallback if validation fails
    return {
      contextPaths: [],
      smartContextAutoIncludes: [],
      excludePaths: [],
    };
  }
}
