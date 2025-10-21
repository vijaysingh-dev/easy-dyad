import { useQuery } from "@tanstack/react-query";
import type { ProblemReport } from "@shared/eeziTypes";
import { useSettings } from "./useSettings";
import api from "@/api";

export function useCheckProblems(appId: number | null) {
  const { settings } = useSettings();
  const {
    data: problemReport,
    isLoading: isChecking,
    error,
    refetch: checkProblems,
  } = useQuery<ProblemReport, Error>({
    queryKey: ["problems", appId],
    queryFn: async (): Promise<ProblemReport> => {
      if (!appId) {
        throw new Error("App ID is required");
      }
      return api.app.checkProblems({ appId });
    },
    enabled: !!appId && settings?.enableAutoFixProblems,
    // DO NOT SHOW ERROR TOAST.
  });

  return {
    problemReport,
    isChecking,
    error,
    checkProblems,
  };
}
