import { useCallback } from "react";
import { useAtom } from "jotai";
import {
  lmStudioModelsAtom,
  lmStudioModelsLoadingAtom,
  lmStudioModelsErrorAtom,
} from "@/atoms/localModelsAtoms";
import api from "@/api";

export function useLocalLMSModels() {
  const [models, setModels] = useAtom(lmStudioModelsAtom);
  const [loading, setLoading] = useAtom(lmStudioModelsLoadingAtom);
  const [error, setError] = useAtom(lmStudioModelsErrorAtom);

  /**
   * Load local models from Ollama
   */
  const loadModels = useCallback(async () => {
    setLoading(true);
    try {
      const modelList = await api.llm.listLocalLMStudioModels();
      setModels(modelList);
      setError(null);

      return modelList;
    } catch (error) {
      console.error("Error loading local LMStudio models:", error);
      setError(error instanceof Error ? error : new Error(String(error)));
      return [];
    } finally {
      setLoading(false);
    }
  }, [setModels, setError, setLoading]);

  return {
    models,
    loading,
    error,
    loadModels,
  };
}
