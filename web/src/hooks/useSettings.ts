import { useEffect, useState, useCallback } from "react";
import { useAtomValue, useSetAtom, useAtom } from "jotai";
import {
  settingsDataAtom,
  userSettingsAtom,
  envVarsAtom,
  processSettingsForTelemetry,
} from "@/atoms/settingsAtom";
import { usePostHog } from "posthog-js/react";
import { appVersionAtom } from "@/atoms/appAtoms";
import { type UserSettings } from "@shared/schemas";
import api from "@/api";

let isInitialLoadTracked = false;

export function useSettings() {
  // 🧠 Load only once globally (cached by Jotai)
  const [data] = useAtom(settingsDataAtom);

  const setUserSettings = useSetAtom(userSettingsAtom);
  const setEnvVars = useSetAtom(envVarsAtom);
  const appVersion = useAtomValue(appVersionAtom);
  const posthog = usePostHog();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!isInitialLoadTracked && data?.settings && appVersion) {
      posthog.capture("app:initial-load", {
        isPro: Boolean(data.settings.providerSettings?.auto?.apiKey?.value),
        appVersion,
      });
      isInitialLoadTracked = true;
    }
  }, [data?.settings, appVersion, posthog]);

  const updateSettings = useCallback(
    async (newSettings: Partial<UserSettings>) => {
      setLoading(true);
      try {
        const updatedSettings = await api.settings.setUserSettings(newSettings);
        processSettingsForTelemetry(updatedSettings);
        setUserSettings(updatedSettings);
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
    [setUserSettings]
  );

  const refreshSettings = useCallback(async () => {
    setLoading(true);
    try {
      const [settings, envVars] = await Promise.all([
        api.settings.getUserSettings(),
        api.settings.getEnvVars(),
      ]);
      processSettingsForTelemetry(settings);
      setUserSettings(settings);
      setEnvVars(envVars);
    } catch (err) {
      console.error("Error refreshing settings:", err);
    } finally {
      setLoading(false);
    }
  }, [setUserSettings, setEnvVars]);

  return {
    settings: data?.settings ?? null,
    envVars: data?.envVars ?? {},
    loading,
    error,
    updateSettings,
    refreshSettings,
  };
}
