import { AppSearchResult } from "@/shared/schemas";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import api from "@/api";

export function useSearchApps(query: string) {
  const enabled = Boolean(query && query.trim().length > 0);

  const { data, isFetching, isLoading } = useQuery({
    queryKey: ["search-apps", query],
    enabled,
    queryFn: async (): Promise<AppSearchResult[]> => {
      return api.app.searchApps(query);
    },
    placeholderData: keepPreviousData,
    retry: 0,
  });

  return {
    apps: data ?? [],
    loading: enabled ? isFetching || isLoading : false,
  };
}
