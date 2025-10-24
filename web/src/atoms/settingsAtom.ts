import { atom } from "jotai";
import { type UserSettings } from "@shared/schemas";
import api from "@/api";

const TELEMETRY_CONSENT_KEY = "eeziTelemetryConsent";
const TELEMETRY_USER_ID_KEY = "eeziTelemetryUserId";

export const userSettingsAtom = atom<UserSettings | null>(null);

// Atom for storing allow-listed environment variables
export const envVarsAtom = atom<Record<string, string | undefined>>({});

export const refreshCounterAtom = atom(0);
export const settingsDataAtom = atom(async (get) => {
  get(refreshCounterAtom); // dependency
  const [settings, envVars] = await Promise.all([
    api.settings.getUserSettings(),
    api.settings.getEnvVars(),
  ]);
  processSettingsForTelemetry(settings);
  return { settings, envVars };
});

export function processSettingsForTelemetry(settings: UserSettings) {
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

export function isTelemetryOptedIn() {
  return localStorage.getItem(TELEMETRY_CONSENT_KEY) === "opted_in";
}

export function getTelemetryUserId(): string | null {
  return localStorage.getItem(TELEMETRY_USER_ID_KEY);
}
