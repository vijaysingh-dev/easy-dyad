import Api from "./api";
import { AxiosRequestConfig } from "axios";
import { AppSearchResultsSchema } from "@shared/schemas";
import {
  CreateAppParams,
  CreateAppResult,
  ListAppsResponse,
  CreatePromptParamsDto,
  UpdatePromptParamsDto,
  CopyAppParams,
  RespondToAppInputParams,
  AppOutput,
  GetAppEnvVarsParams,
  SetAppEnvVarsParams,
  ImportAppParams,
} from "@shared/eeziTypes";
import { showError } from "@/components/Toast";
import eeziClient from "./client";

class AppApiService {
  // Open an external URL using the default browser
  openExternalUrl(url: string) {
    const newTab = window.open(url, "_blank");
    newTab?.focus();
  }

  public minimizeWindow() {
    console.log("Minimize window called");
  }
  public maximizeWindow() {
    console.log("Maximize window called");
  }
  public closeWindow() {
    console.log("Close window called");
  }

  public async selectAppFolder() {
    return { app: null, name: null };
  }

  public async checkAiRules(params: { path: string }) {
    const config: AxiosRequestConfig = { params };
    const { data } = await Api.get("/app/check-ai-rules", { config });
    return data;
  }

  public async restartEezi(): Promise<void> {
    window.location.reload();
  }

  async clearSessionData(): Promise<void> {
    localStorage.clear();
    sessionStorage.clear();
  }

  public async reloadEnvPath() {
    return Promise.resolve(() =>
      setTimeout(() => {
        window.location.reload();
      }, 1000)
    );
  }

  // Get the main app version
  public async getAppVersion() {
    const { data } = await Api.get("/app/get-app-version");
    return data.version as string;
  }

  public async showItemInFolder(fullPath: string): Promise<void> {
    const { data } = await Api.post("/app/show-item-in-folder", { fullPath });
    return data;
  }

  // Get system platform (win32, darwin, linux)
  public async getSystemPlatform() {
    const { data } = await Api.get("/app/get-system-platform");
    return data;
  }

  public async getSystemDebugInfo() {
    const { data } = await Api.get("/app/get-system-debug-info");
    return data;
  }

  public async getChatLogs(chatId: number) {
    const { data } = await Api.get(`/app/get-chat-logs/${chatId}`);
    return data;
  }

  public async uploadToSignedUrl(url: string, contentType: string, data: any) {
    const res = await Api.post("/app/upload-to-signed-url", {
      url,
      contentType,
      data,
    });
    return res.data;
  }

  // --- Portal Management ---
  public async portalMigrateCreate(params: { appId: number }) {
    const { data } = await Api.post("/app/portal/migrate-create", params);
    return data;
  }
  // --- End Portal Management ---

  // Create a new app with an initial chat
  public async createApp(params: CreateAppParams) {
    const { data } = await Api.post(`/app/create-app`, params);
    return data as CreateAppResult;
  }
  public async copyApp(params: CopyAppParams) {
    const { data } = await Api.post(`/app/copy-app`, params);
    return data;
  }
  public async getApp(appId: number) {
    const { data } = await Api.get(`/app/get-app/${appId}`);
    return data;
  }

  public async listApps() {
    const { data } = await Api.get(`/app/list-apps`);
    return data as ListAppsResponse;
  }

  public async readAppFile(appId: number, filePath: string) {
    const { data } = await Api.get(
      `/app/read-app-file/${appId}/${encodeURIComponent(filePath)}`
    );
    return data;
  }

  // Run an app
  public async runApp(appId: number, onOutput: (output: AppOutput) => void) {
    eeziClient.appStreams.delete(appId);
    eeziClient.eventSources["app"]?.close();

    eeziClient.appStreams.set(appId, { onOutput });
    const url = eeziClient.baseURL + `/app/run-app/${appId}`;
    eeziClient.initAppStreamSSE(url);
  }

  // Stop a running app
  public async stopApp(appId: number) {
    const { data } = await Api.post("/app/stop-app", { appId });
    return data;
  }

  // Restart a running app
  public async restartApp(
    appId: number,
    onOutput: (output: AppOutput) => void,
    removeNodeModules?: boolean
  ) {
    eeziClient.appStreams.delete(appId);
    eeziClient.eventSources["app"]?.close();
    await new Promise((resolve) => setTimeout(resolve, 500));

    eeziClient.appStreams.set(appId, { onOutput });
    const url =
      eeziClient.baseURL +
      `/app/restart-app/${appId}?removeNodeModules=${!!removeNodeModules}`;
    eeziClient.initAppStreamSSE(url);
  }

  // Edit a file in an app directory
  public async editAppFile(appId: number, filePath: string, content: string) {
    const { data } = await Api.post("/app/edit-app-file", {
      appId,
      filePath,
      content,
    });
    return data;
  }

  // Delete an app and all its files
  public async deleteApp(appId: number) {
    const { data } = await Api.delete(`/app/delete-app/${appId}`);
    return data;
  }

  public async getAppEnvVars(params: GetAppEnvVarsParams) {
    const config: AxiosRequestConfig = { params };
    const { data } = await Api.get("/app/get-app-env-vars", { config });
    return data;
  }

  public async setAppEnvVars(params: SetAppEnvVarsParams) {
    const { data } = await Api.post("/app/set-app-env-vars", params);
    return data;
  }

  public async addAppToFavorite(appId: number) {
    try {
      const { data } = await Api.post("/app/add-to-favorite", { appId });
      return data;
    } catch (error) {
      showError(error);
      throw error;
    }
  }
  public async importApp(params: ImportAppParams) {
    const { data } = await Api.post("/app/import-app", params);
    return data;
  }

  // Rename an app (update name and path)
  public async renameApp({
    appId,
    appName,
    appPath,
  }: {
    appId: number;
    appName: string;
    appPath: string;
  }) {
    const { data } = await Api.post("/app/rename-app", {
      appId,
      appName,
      appPath,
    });
    return data;
  }

  // Reset all - removes all app files, settings, and drops the database
  public async resetAll() {
    const { data } = await Api.get("/app/reset-all");
    return data;
  }

  // Respond to an app input request (y/n prompts)
  public async respondToAppInput(params: RespondToAppInputParams) {
    try {
      const { data } = await Api.post("/app/respond-to-app-input", params);
      return data;
    } catch (error) {
      showError(error);
    }
  }

  // Search apps by name
  public async searchApps(searchQuery: string) {
    try {
      const { data } = await Api.post("/app/search-app", { searchQuery });
      return AppSearchResultsSchema.parse(data);
    } catch (error) {
      showError(error);
      throw error;
    }
  }

  public async checkAppName(params: { appName: string }) {
    const config: AxiosRequestConfig = { params };
    const { data } = await Api.get("/app/check-app-name", { config });
    return data;
  }

  public async getAppUpgrades(params: { appId: number }) {
    const config: AxiosRequestConfig = { params };
    const { data } = await Api.get("/app/get-app-upgrades", { config });
    return data;
  }

  public async executeAppUpgrade(params: { appId: number; upgradeId: string }) {
    const { data } = await Api.post("/app/execute-app-upgrade", { params });
    return data;
  }

  // Capacitor methods
  public async isCapacitor(params: { appId: number }) {
    const config: AxiosRequestConfig = { params };
    const { data } = await Api.get("/app/is-capacitor", { config });
    return data.isCapacitor as boolean;
  }

  public async syncCapacitor(params: { appId: number }) {
    // return this.ipcRenderer.invoke("sync-capacitor", params);
    const config: AxiosRequestConfig = { params };
    const { data } = await Api.get("/app/sync-capacitor", { config });
    return data;
  }

  public async openIos(params: { appId: number }): Promise<void> {
    // return this.ipcRenderer.invoke("open-ios", params);
    const config: AxiosRequestConfig = { params };
    const { data } = await Api.get("/app/open-ios", { config });
    return data;
  }

  public async openAndroid(params: { appId: number }): Promise<void> {
    const config: AxiosRequestConfig = { params };
    const { data } = await Api.get("/app/open-android", { config });
    return data;
  }

  public async checkProblems(params: { appId: number }) {
    const config: AxiosRequestConfig = { params };
    const { data } = await Api.get("/app/check-problems", { config });
    return data;
  }

  // Template methods
  public async getTemplates() {
    const { data } = await Api.get("/app/get-templates");
    return data;
  }

  // --- Prompts Library ---
  public async listPrompts() {
    const { data } = await Api.get("/app/prompts");
    return data;
  }

  public async createPrompt(params: CreatePromptParamsDto) {
    const { data } = await Api.post("/app/prompts", params);
    return data;
  }

  public async updatePrompt(params: UpdatePromptParamsDto) {
    const { data } = await Api.patch("/app/prompts", params);
    return data;
  }

  public async deletePrompt(id: number) {
    const { data } = await Api.delete(`/app/prompts/${id}`);
    return data;
  }
  // --- End Prompts Library ---
}

const appApi = new AppApiService();
export default appApi;
