import { atom } from "jotai";
import type { App, AppOutput, Version } from "@/shared/easyTypes";
import type { UserSettings } from "@/shared/schemas";
import api from "@/api";

export const currentAppAtom = atom<App | null>(null);
export const selectedAppIdAtom = atom<string | null>(null);
export const appsListAtom = atom<App[]>([]);
export const appBasePathAtom = atom<string>("");
export const versionsListAtom = atom<Version[]>([]);
export const previewModeAtom = atom<
  "preview" | "code" | "problems" | "configure" | "publish"
>("preview");
export const selectedVersionIdAtom = atom<string | null>(null);
export const appOutputAtom = atom<AppOutput[]>([]);
export const appUrlAtom = atom<
  | { appUrl: string; appId: string; originalUrl: string }
  | { appUrl: null; appId: null; originalUrl: null }
>({ appUrl: null, appId: null, originalUrl: null });

export const previewPanelKeyAtom = atom<number>(0);

export const previewErrorMessageAtom = atom<
  { message: string; source: "preview-app" | "easy-app" } | undefined
>(undefined);

export const userSettingsAtom = atom<UserSettings | null>(null);
// Atom for storing allow-listed environment variables
export const envVarsAtom = atom<Record<string, string | undefined>>({});

export const appVersionAtom = atom(async (get) => {
  return await api.app.getAppVersion();
});
