import { atom } from "jotai";
import type { App, AppOutput, Version } from "@shared/eeziTypes";
import api from "@/api";

export const currentAppAtom = atom<App | null>(null);
export const selectedAppIdAtom = atom<number | null>(null);
export const appsListAtom = atom<App[]>([]);
export const appBasePathAtom = atom<string>("");
export const versionsListAtom = atom<Version[]>([]);
export const previewModeAtom = atom<
  "preview" | "code" | "problems" | "configure" | "publish"
>("preview");
export const selectedVersionIdAtom = atom<string | null>(null);
export const appOutputAtom = atom<AppOutput[]>([]);
export const appUrlAtom = atom<
  | { appUrl: string; appId: number; originalUrl: string }
  | { appUrl: null; appId: null; originalUrl: null }
>({ appUrl: null, appId: null, originalUrl: null });

export const previewPanelKeyAtom = atom<number>(0);

export const previewErrorMessageAtom = atom<
  { message: string; source: "preview-app" | "eezi-app" } | undefined
>(undefined);

export const appVersionAtom = atom(async (get) => {
  try {
    return await api.version.getAppVersion();
  } catch {
    return null;
  }
});

const appsLoadedAtom = atom(false);
// Atom to handle refreshing apps
export const refreshAppsAtom = atom(null, async (get, set) => {
  const response = await api.app.listApps();
  set(appsListAtom, response.apps);
  set(appBasePathAtom, response.appBasePath);
  set(appsLoadedAtom, true);
});
