import { useQuery } from "@tanstack/react-query";
import api from "@/api";
export const useCheckName = (appName: string) => {
  return useQuery({
    queryKey: ["checkAppName", appName],
    queryFn: async () => {
      const result = await api.app.checkAppName({ appName });
      return result;
    },
    enabled: !!appName && !!appName.trim(),
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: false,
    staleTime: 300000, // 5 minutes
  });
};
