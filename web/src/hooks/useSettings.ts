import { useState, useEffect, useCallback } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import {
  userSettingsAtom,
  settingsDataAtom,
  refreshCounterAtom,
  processSettingsForTelemetry,
} from "@/atoms/settingsAtom";
import { type UserSettings } from "@shared/schemas";
import { usePostHog } from "posthog-js/react";
import { appVersionAtom } from "@/atoms/appAtoms";
import api from "@/api";

let isInitialLoadTracked = false;

export function useSettings() {
  const posthog = usePostHog();
  const appVersion = useAtomValue(appVersionAtom);

  const { settings, envVars } = useAtomValue(settingsDataAtom);
  const setSettingsAtom = useSetAtom(userSettingsAtom);
  const setRefreshAtom = useSetAtom(refreshCounterAtom);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Track initial app load once
  useEffect(() => {
    if (!isInitialLoadTracked && appVersion) {
      posthog.capture("app:initial-load", {
        isPro: Boolean(settings.providerSettings?.auto?.apiKey?.value),
        appVersion,
      });
      isInitialLoadTracked = true;
    }
  }, [settings, appVersion, posthog]);
  const updateSettings = useCallback(
    async (newSettings: Partial<UserSettings>) => {
      setLoading(true);
      try {
        const updatedSettings = await api.settings.setUserSettings(newSettings);
        setSettingsAtom(updatedSettings);
        processSettingsForTelemetry(updatedSettings);
        setError(null);
        return updatedSettings;
      } catch (err) {
        console.error("Error updating settings:", err);
        const errorObj = err instanceof Error ? err : new Error(String(err));
        setError(errorObj);
        throw errorObj;
      } finally {
        setLoading(false);
      }
    },
    [setSettingsAtom]
  );

  return {
    settings,
    envVars,
    loading,
    error,
    updateSettings,
    refreshSettings: () => {
      setRefreshAtom((c) => c + 1);
    },
  };
}
