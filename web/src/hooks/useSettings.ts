import { useState, useEffect, useCallback } from "react";
import { useAtom } from "jotai";
import { userSettingsAtom, envVarsAtom } from "@/atoms/appAtoms";
import { type UserSettings } from "@shared/schemas";
import { usePostHog } from "posthog-js/react";
import { useAppVersion } from "./useAppVersion";
import api from "@/api";

const TELEMETRY_CONSENT_KEY = "eeziTelemetryConsent";
const TELEMETRY_USER_ID_KEY = "eeziTelemetryUserId";

export function isTelemetryOptedIn() {
  return localStorage.getItem(TELEMETRY_CONSENT_KEY) === "opted_in";
}

export function getTelemetryUserId(): string | null {
  return localStorage.getItem(TELEMETRY_USER_ID_KEY);
}

let isInitialLoad = false;

export function useSettings() {
  const posthog = usePostHog();
  const [settings, setSettingsAtom] = useAtom(userSettingsAtom);
  const [envVars, setEnvVarsAtom] = useAtom(envVarsAtom);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const appVersion = useAppVersion();
  const loadInitialData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch settings and env vars concurrently
      const [userSettings, fetchedEnvVars] = await Promise.all([
        api.settings.getUserSettings(),
        api.settings.getEnvVars(),
      ]);
      processSettingsForTelemetry(userSettings);
      if (!isInitialLoad && appVersion) {
        posthog.capture("app:initial-load", {
          isPro: Boolean(userSettings.providerSettings?.auto?.apiKey?.value),
          appVersion,
        });
        isInitialLoad = true;
      }
      setSettingsAtom(userSettings);
      setEnvVarsAtom(fetchedEnvVars);
      setError(null);
    } catch (error) {
      console.error("Error loading initial data:", error);
      setError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      setLoading(false);
    }
  }, [setSettingsAtom, setEnvVarsAtom, appVersion]);

  useEffect(() => {
    // Only run once on mount, dependencies are stable getters/setters
    loadInitialData();
  }, [loadInitialData]);

  const updateSettings = async (newSettings: Partial<UserSettings>) => {
    setLoading(true);
    try {
      const updatedSettings = await api.settings.setUserSettings(newSettings);
      setSettingsAtom(updatedSettings);
      processSettingsForTelemetry(updatedSettings);

      setError(null);
      return updatedSettings;
    } catch (error) {
      console.error("Error updating settings:", error);
      setError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      setLoading(false);
    }
  };

  return {
    settings,
    envVars,
    loading,
    error,
    updateSettings,

    refreshSettings: () => {
      return loadInitialData();
    },
  };
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
