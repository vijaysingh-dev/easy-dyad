import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CreateCustomLanguageModelProviderParams,
  LanguageModelProvider,
} from "@shared/eeziTypes";
import { showError } from "@/components/Toast";
import api from "@/api";

export function useCustomLanguageModelProvider() {
  const queryClient = useQueryClient();

  const createProviderMutation = useMutation({
    mutationFn: async (
      params: CreateCustomLanguageModelProviderParams
    ): Promise<LanguageModelProvider> => {
      if (!params.id.trim()) {
        throw new Error("Provider ID is required");
      }
      if (!params.name.trim()) {
        throw new Error("Provider name is required");
      }
      if (!params.apiBaseUrl.trim()) {
        throw new Error("API base URL is required");
      }

      return api.mcp.createCustomLanguageModelProvider({
        id: params.id.trim(),
        name: params.name.trim(),
        apiBaseUrl: params.apiBaseUrl.trim(),
        envVarName: params.envVarName?.trim() || undefined,
      });
    },
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: ["languageModelProviders"] });
    },
    onError: (error) => {
      showError(error);
    },
  });

  const editProviderMutation = useMutation({
    mutationFn: async (
      params: CreateCustomLanguageModelProviderParams
    ): Promise<LanguageModelProvider> => {
      if (!params.id.trim()) {
        throw new Error("Provider ID is required");
      }
      if (!params.name.trim()) {
        throw new Error("Provider name is required");
      }
      if (!params.apiBaseUrl.trim()) {
        throw new Error("API base URL is required");
      }

      return api.mcp.editCustomLanguageModelProvider({
        id: params.id.trim(),
        name: params.name.trim(),
        apiBaseUrl: params.apiBaseUrl.trim(),
        envVarName: params.envVarName?.trim() || undefined,
      });
    },
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: ["languageModelProviders"] });
    },
    onError: (error) => {
      showError(error);
    },
  });

  const deleteProviderMutation = useMutation({
    mutationFn: async (providerId: string): Promise<void> => {
      if (!providerId) {
        throw new Error("Provider ID is required");
      }

      return api.mcp.deleteCustomLanguageModelProvider(providerId);
    },
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: ["languageModelProviders"] });
    },
    onError: (error) => {
      showError(error);
    },
  });

  const createProvider = async (
    params: CreateCustomLanguageModelProviderParams
  ): Promise<LanguageModelProvider> => {
    return createProviderMutation.mutateAsync(params);
  };

  const editProvider = async (
    params: CreateCustomLanguageModelProviderParams
  ): Promise<LanguageModelProvider> => {
    return editProviderMutation.mutateAsync(params);
  };

  const deleteProvider = async (providerId: string): Promise<void> => {
    return deleteProviderMutation.mutateAsync(providerId);
  };

  return {
    createProvider,
    editProvider,
    deleteProvider,
    isCreating: createProviderMutation.isPending,
    isEditing: editProviderMutation.isPending,
    isDeleting: deleteProviderMutation.isPending,
    error:
      createProviderMutation.error ||
      editProviderMutation.error ||
      deleteProviderMutation.error,
  };
}
