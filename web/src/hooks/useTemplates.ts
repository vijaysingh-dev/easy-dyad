import { useQuery } from "@tanstack/react-query";
import { localTemplatesData, type Template } from "@shared/templates";
import api from "@/api";

export function useTemplates() {
  const query = useQuery({
    queryKey: ["templates"],
    queryFn: async (): Promise<Template[]> => {
      return api.app.getTemplates();
    },
    initialData: localTemplatesData,
    meta: {
      showErrorToast: true,
    },
  });

  return {
    templates: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
