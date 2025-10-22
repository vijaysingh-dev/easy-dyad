import logger from "@/logger";
import { getEeziAppPath } from "@/services/paths";
import { estimateTokens } from "@/utils/token_utils";
import { extractCodebase } from "@/utils/codebase";
import { validateChatContext } from "@/utils/context_paths_utils";

// Cache for codebase token counts
interface CodebaseTokenCache {
  chatId: number;
  messageId: number;
  messageContent: string;
  tokenCount: number;
  timestamp: number;
  chatContext: string;
}

// Cache expiration time (5 minutes)
const CACHE_EXPIRATION_MS = 5 * 60 * 1000;

// In-memory cache for codebase token counts
const codebaseTokenCache = new Map<number, CodebaseTokenCache>();

// Function to clean up expired cache entries
export function cleanupExpiredCacheEntries() {
  const now = Date.now();
  let expiredCount = 0;

  codebaseTokenCache.forEach((entry, key) => {
    if (now - entry.timestamp > CACHE_EXPIRATION_MS) {
      codebaseTokenCache.delete(key);
      expiredCount++;
    }
  });

  if (expiredCount > 0) {
    logger.log(`Cleaned up ${expiredCount} expired codebase token cache entries`);
  }
}

// Function to get cached token count or calculate and cache it
export async function getCodebaseTokenCount(
  chatId: number,
  messageId: number,
  messageContent: string,
  appPath: string,
  chatContext: unknown
): Promise<number> {
  // Clean up expired cache entries first
  cleanupExpiredCacheEntries();

  const cacheEntry = codebaseTokenCache.get(chatId);
  const now = Date.now();

  // Check if cache is valid - same chat, message and content, and not expired
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

  // Calculate and cache the token count
  logger.log(`Calculating codebase token count for chatId: ${chatId}`);
  const codebase = (
    await extractCodebase({
      appPath: getEeziAppPath(appPath),
      chatContext: validateChatContext(chatContext),
    })
  ).formattedOutput;
  const tokenCount = estimateTokens(codebase);

  // Store in cache
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
