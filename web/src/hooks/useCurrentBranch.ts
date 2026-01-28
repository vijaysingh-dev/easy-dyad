import { useQuery } from "@tanstack/react-query";
import type { BranchResult } from "@/shared/easyTypes";
import api from "@/api";

export function useCurrentBranch(appId: string | null) {
  const {
    data: branchInfo,
    isLoading,
    refetch: refetchBranchInfo,
  } = useQuery<BranchResult, Error>({
    queryKey: ["currentBranch", appId],
    queryFn: async (): Promise<BranchResult> => {
      if (appId === null) {
        // This case should ideally be handled by the `enabled` option
        // but as a safeguard, and to ensure queryFn always has a valid appId if called.
        throw new Error("appId is null, cannot fetch current branch.");
      }
      return await api.version.getCurrentBranch(appId);
    },
    enabled: appId !== null,
    meta: { showErrorToast: true },
  });

  return {
    branchInfo,
    isLoading,
    refetchBranchInfo,
  };
}
