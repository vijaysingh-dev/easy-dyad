import { useQuery } from "@tanstack/react-query";
import type { LanguageModel } from "@shared/eeziTypes";
import api from "@/api";

/**
 * Fetches the list of available language models for a specific provider.
 *
 * @param providerId The ID of the language model provider.
 * @returns TanStack Query result object for the language models.
 */
export function useLanguageModelsForProvider(providerId: string | undefined) {
  return useQuery<
    LanguageModel[],
    Error // Specify Error type for better error handling
  >({
    queryKey: ["language-models", providerId],
    queryFn: async () => {
      if (!providerId) {
        // Avoid calling API if providerId is not set
        // Return an empty array as it's a query, not an error state
        return [];
      }
      return api.llm.getLanguageModels({ providerId });
    },
    enabled: !!providerId,
  });
}
