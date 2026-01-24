import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { VercelDeployment } from "@/shared/eeziTypes";
import api from "@/api";

export function useVercelDeployments(appId: string) {
  const queryClient = useQueryClient();

  const {
    data: deployments = [],
    isLoading,
    error,
    refetch,
  } = useQuery<VercelDeployment[], Error>({
    queryKey: ["vercel-deployments", appId],
    queryFn: async () => {
      return api.integration.getVercelDeployments({ appId });
    },
    // enabled: false, // Don't auto-fetch, only fetch when explicitly requested
  });

  const disconnectProjectMutation = useMutation<void, Error, void>({
    mutationFn: async () => {
      return api.integration.disconnectVercelProject({ appId });
    },
    onSuccess: () => {
      // Clear deployments cache when project is disconnected
      queryClient.removeQueries({ queryKey: ["vercel-deployments", appId] });
    },
  });

  const getDeployments = async () => {
    return refetch();
  };

  const disconnectProject = async () => {
    return disconnectProjectMutation.mutateAsync();
  };

  return {
    deployments,
    isLoading,
    error: error?.message || null,
    getDeployments,
    disconnectProject,
    isDisconnecting: disconnectProjectMutation.isPending,
    disconnectError: disconnectProjectMutation.error?.message || null,
  };
}
