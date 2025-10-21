import { useMutation } from "@tanstack/react-query";
import { showError, showSuccess } from "@/components/Toast";
import { useAtom } from "jotai";
import { appsListAtom } from "@/atoms/appAtoms";
import api from "@/api";

export function useAddAppToFavorite() {
  const [_, setApps] = useAtom(appsListAtom);

  const mutation = useMutation<boolean, Error, number>({
    mutationFn: async (appId: number): Promise<boolean> => {
      const result = await api.app.addAppToFavorite(appId);
      return result.isFavorite;
    },
    onSuccess: (newIsFavorite, appId) => {
      setApps((currentApps) =>
        currentApps.map((app) =>
          app.id === appId ? { ...app, isFavorite: newIsFavorite } : app
        )
      );
      showSuccess("App favorite status updated");
    },
    onError: (error) => {
      showError(error.message || "Failed to update favorite status");
    },
  });

  return {
    toggleFavorite: mutation.mutate,
    toggleFavoriteAsync: mutation.mutateAsync,
    isLoading: mutation.isPending,
    error: mutation.error,
    isError: mutation.isError,
    isSuccess: mutation.isSuccess,
  };
}
