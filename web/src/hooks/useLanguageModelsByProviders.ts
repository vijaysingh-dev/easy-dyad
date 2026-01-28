import { useQuery } from "@tanstack/react-query";
import type { LanguageModel } from "@/shared/easyTypes";
import api from "@/api";

/**
 * Fetches all available language models grouped by their provider IDs.
 *
 * @returns TanStack Query result object for the language models organized by provider.
 */
export function useLanguageModelsByProviders() {
  return useQuery<Record<string, LanguageModel[]>, Error>({
    queryKey: ["language-models-by-providers"],
    queryFn: async () => {
      return api.llm.getLanguageModelsByProviders();
    },
  });
}
