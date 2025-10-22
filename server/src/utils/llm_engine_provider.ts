import logger from "@/logger";
import { OpenAICompatibleChatLanguageModel } from "@ai-sdk/openai-compatible";
import { LanguageModelV2 } from "@ai-sdk/provider";
import { FetchFunction, loadApiKey, withoutTrailingSlash } from "@ai-sdk/provider-utils";

import { getExtraProviderOptions } from "./thinking_utils";
import type { UserSettings } from "@shared/schemas";

export type ExampleChatModelId = string & {};

export interface ExampleChatSettings {
  files?: { path: string; content: string }[];
}
export interface ExampleProviderSettings {
  /**
Example API key.
*/
  apiKey?: string;
  /**
Base URL for the API calls.
*/
  baseURL?: string;
  /**
Custom headers to include in the requests.
*/
  headers?: Record<string, string>;
  /**
Optional custom url query parameters to include in request urls.
*/
  queryParams?: Record<string, string>;
  /**
Custom fetch implementation. You can use it as a middleware to intercept requests,
or to provide a custom fetch implementation for e.g. testing.
*/
  fetch?: FetchFunction;

  originalProviderId: string;
  eeziOptions: {
    enableLazyEdits?: boolean;
    enableSmartFilesContext?: boolean;
    enableWebSearch?: boolean;
    smartContextMode?: "balanced" | "conservative";
  };
  settings: UserSettings;
}

export interface EeziEngineProvider {
  /**
Creates a model for text generation.
*/
  (modelId: ExampleChatModelId, settings?: ExampleChatSettings): LanguageModelV2;

  /**
Creates a chat model for text generation.
*/
  chatModel(
    modelId: ExampleChatModelId,
    settings?: ExampleChatSettings
  ): LanguageModelV2;
}

export function createEeziEngine(options: ExampleProviderSettings): EeziEngineProvider {
  const baseURL = withoutTrailingSlash(options.baseURL);
  logger.info("creating eezi engine with baseURL", baseURL);

  // Track request ID attempts
  const requestIdAttempts = new Map<string, number>();

  const getHeaders = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: "DYAD_PRO_API_KEY",
      description: "Example API key",
    })}`,
    ...options.headers,
  });

  interface CommonModelConfig {
    provider: string;
    url: ({ path }: { path: string }) => string;
    headers: () => Record<string, string>;
    fetch?: FetchFunction;
  }

  const getCommonModelConfig = (): CommonModelConfig => ({
    provider: `eezi-engine`,
    url: ({ path }) => {
      const url = new URL(`${baseURL}${path}`);
      if (options.queryParams) {
        url.search = new URLSearchParams(options.queryParams).toString();
      }
      return url.toString();
    },
    headers: getHeaders,
    fetch: options.fetch,
  });

  const createChatModel = (
    modelId: ExampleChatModelId,
    settings: ExampleChatSettings = {}
  ) => {
    // Extract files from settings to process them appropriately
    const { files } = settings;

    // Create configuration with file handling
    const config = {
      ...getCommonModelConfig(),
      // defaultObjectGenerationMode:
      //   "tool" as LanguageModelV1ObjectGenerationMode,
      // Custom fetch implementation that adds files to the request
      fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        // Use default fetch if no init or body
        if (!init || !init.body || typeof init.body !== "string") {
          return (options.fetch || fetch)(input, init);
        }

        try {
          // Parse the request body to manipulate it
          const parsedBody = {
            ...JSON.parse(init.body),
            ...getExtraProviderOptions(options.originalProviderId, options.settings),
          };
          const requestId = parsedBody.eeziRequestId;
          if ("eeziRequestId" in parsedBody) {
            delete parsedBody.eeziRequestId;
          }
          const eeziDisableFiles = parsedBody.eeziDisableFiles;
          if ("eeziDisableFiles" in parsedBody) {
            delete parsedBody.eeziDisableFiles;
          }
          const eeziMentionedApps = parsedBody.eeziMentionedApps;
          if ("eeziMentionedApps" in parsedBody) {
            delete parsedBody.eeziMentionedApps;
          }

          // Track and modify requestId with attempt number
          let modifiedRequestId = requestId;
          if (requestId) {
            const currentAttempt = (requestIdAttempts.get(requestId) || 0) + 1;
            requestIdAttempts.set(requestId, currentAttempt);
            modifiedRequestId = `${requestId}:attempt-${currentAttempt}`;
          }

          // Add files to the request if they exist
          if (files?.length && !eeziDisableFiles) {
            parsedBody.eezi_options = {
              files,
              enable_lazy_edits: options.eeziOptions.enableLazyEdits,
              enable_smart_files_context: options.eeziOptions.enableSmartFilesContext,
              smart_context_mode: options.eeziOptions.smartContextMode,
              enable_web_search: options.eeziOptions.enableWebSearch,
            };
            if (eeziMentionedApps?.length) {
              parsedBody.eezi_options.mentioned_apps = eeziMentionedApps;
            }
          }

          // Return modified request with files included and requestId in headers
          const modifiedInit = {
            ...init,
            headers: {
              ...init.headers,
              ...(modifiedRequestId && {
                "X-Eezi-Request-Id": modifiedRequestId,
              }),
            },
            body: JSON.stringify(parsedBody),
          };

          // Use the provided fetch or default fetch
          return (options.fetch || fetch)(input, modifiedInit);
        } catch (e) {
          logger.error("Error parsing request body", e);
          // If parsing fails, use original request
          return (options.fetch || fetch)(input, init);
        }
      },
    };

    return new OpenAICompatibleChatLanguageModel(modelId, config);
  };

  const provider = (modelId: ExampleChatModelId, settings?: ExampleChatSettings) =>
    createChatModel(modelId, settings);

  provider.chatModel = createChatModel;

  return provider;
}
