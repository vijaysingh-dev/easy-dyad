import { useMutation, useQueryClient } from "@tanstack/react-query";
import { showError } from "@/components/Toast";
import { useLoadApps } from "@/hooks/useLoadApps";
import type { CreateAppParams, CreateAppResult } from "@/shared/eeziTypes";
import api from "@/api";

export function useCreateApp() {
  const queryClient = useQueryClient();
  const { refreshApps } = useLoadApps();

  const mutation = useMutation<CreateAppResult, Error, CreateAppParams>({
    mutationFn: async (params: CreateAppParams) => {
      if (!params.name.trim()) {
        throw new Error("App name is required");
      }
      return await api.app.createApp(params);
    },
    onSuccess: () => {
      // Invalidate apps list to trigger refetch
      queryClient.invalidateQueries({ queryKey: ["apps"] });
    },
    onError: (error) => {
      showError(error);
    },
  });

  const createApp = async (params: CreateAppParams): Promise<CreateAppResult> => {
    return await mutation.mutateAsync(params);
  };

  return {
    createApp,
    isCreating: mutation.isPending,
    error: mutation.error,
  };
}
