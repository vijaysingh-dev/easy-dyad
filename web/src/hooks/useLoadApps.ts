import { useState, useEffect, useCallback } from "react";
import { atom, useAtom } from "jotai";
import { appBasePathAtom, appsListAtom } from "@/atoms/appAtoms";
import api from "@/api";

export const loadedAppsAtom = atom(async (get) => {
  return await api.app.listApps();
});

export function useLoadApps() {
  const [loadedApps] = useAtom(loadedAppsAtom);

  const [apps, setApps] = useAtom(appsListAtom);
  const [, setAppBasePath] = useAtom(appBasePathAtom);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Run initial load once
  useEffect(() => {
    const loadApps = async () => {
      setLoading(true);
      try {
        setApps(loadedApps.apps);
        setAppBasePath(loadedApps.appBasePath);
        setError(null);
      } catch (err) {
        console.error("Error fetching apps:", err);
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setLoading(false);
      }
    };
    loadApps();
  }, [loadedApps, setApps, setAppBasePath]);

  const refreshApps = useCallback(async () => {
    setLoading(true);
    try {
      const appListResponse = await api.app.listApps();
      setApps(appListResponse.apps);
      setAppBasePath(appListResponse.appBasePath);
      setError(null);
    } catch (err) {
      console.error("Error fetching apps:", err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [setApps, setAppBasePath]);

  return { apps, loading, error, refreshApps };
}
