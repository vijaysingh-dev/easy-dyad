import { useEffect, useState, useCallback } from "react";
import { atom, useAtom } from "jotai";
import { usePostHog } from "posthog-js/react";
import { appVersionAtom, userSettingsAtom, envVarsAtom } from "@/atoms/appAtoms";
import { type UserSettings } from "@/shared/schemas";
import api from "@/api";

const TELEMETRY_CONSENT_KEY = "eeziTelemetryConsent";
const TELEMETRY_USER_ID_KEY = "eeziTelemetryUserId";

export function isTelemetryOptedIn() {
  return localStorage.getItem(TELEMETRY_CONSENT_KEY) === "opted_in";
}
export function getTelemetryUserId(): string | null {
  return localStorage.getItem(TELEMETRY_USER_ID_KEY);
}

function processSettingsForTelemetry(settings: UserSettings) {
  if (settings.telemetryConsent) {
    localStorage.setItem(TELEMETRY_CONSENT_KEY, settings.telemetryConsent);
  } else {
    localStorage.removeItem(TELEMETRY_CONSENT_KEY);
  }

  if (settings.telemetryUserId) {
    localStorage.setItem(TELEMETRY_USER_ID_KEY, settings.telemetryUserId);
  } else {
    localStorage.removeItem(TELEMETRY_USER_ID_KEY);
  }
}

let isInitialLoadTracked = false;
function trackInitialLoad(
  settings: UserSettings,
  appVersion: string | null,
  posthog: ReturnType<typeof usePostHog>
) {
  if (isInitialLoadTracked || !appVersion) return;
  posthog.capture("app:initial-load", {
    isPro: Boolean(settings.providerSettings?.auto?.apiKey?.value),
    appVersion,
  });
  isInitialLoadTracked = true;
}

export const settingsDataAtom = atom(async (get) => {
  const [settings, envVars] = await Promise.all([
    api.settings.getUserSettings(),
    api.settings.getEnvVars(),
  ]);
  return { settings, envVars };
});

export function useSettings() {
  const posthog = usePostHog();

  const [appVersion] = useAtom(appVersionAtom);
  const [data] = useAtom(settingsDataAtom);
  const [settings, setSettingsAtom] = useAtom(userSettingsAtom);
  const [envVars, setEnvVarsAtom] = useAtom(envVarsAtom);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Run initial load once
  useEffect(() => {
    setLoading(true);
    try {
      setSettingsAtom((prev) => prev ?? data.settings);
      setEnvVarsAtom((prev) => prev ?? data.envVars);
      trackInitialLoad(data.settings, appVersion, posthog);
      setError(null);
    } catch (err) {
      console.error("Error loading settings:", err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshSettings = useCallback(async () => {
    setLoading(true);
    try {
      const [fetchedSettings, fetchedEnvVars] = await Promise.all([
        api.settings.getUserSettings(),
        api.settings.getEnvVars(),
      ]);

      processSettingsForTelemetry(fetchedSettings);
      setSettingsAtom(fetchedSettings);
      setEnvVarsAtom(fetchedEnvVars);
      setError(null);
    } catch (err) {
      console.error("Error refreshing settings:", err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [appVersion, setSettingsAtom, setEnvVarsAtom]);

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
    refreshSettings,
  };
}
