import Api from "./api";
import { AxiosRequestConfig } from "axios";
import {
  CreateAppParams,
  CreateAppResult,
  ListAppsResponse,
  CreatePromptParamsDto,
  UpdatePromptParamsDto,
  CopyAppParams,
  App,
} from "@shared/eeziTypes";
import { showError } from "@/components/Toast";

class AppApiService {
  // Open an external URL using the default browser
  openExternalUrl(url: string) {
    const newTab = window.open(url, "_blank");
    newTab?.focus();
  }
  async reloadEnvPath() {
    return Promise.resolve(() =>
      setTimeout(() => {
        window.location.reload();
      }, 1000)
    );
  }
  // Create a new app with an initial chat
  async createApp(params: CreateAppParams) {
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

  async listApps() {
    const { data } = await Api.get(`/app/list-apps`);
    return data as ListAppsResponse;
  }

  public async readAppFile(appId: number, filePath: string) {
    const { data } = await Api.get(
      `/app/read-app-file/${appId}/${encodeURIComponent(filePath)}`
    );
    return data;
  }

  // // Run an app
  // public async runApp(
  //   appId: number,
  //   onOutput: (output: AppOutput) => void,
  // ): Promise<void> {
  //   await this.ipcRenderer.invoke("run-app", { appId });
  //   this.appStreams.set(appId, { onOutput });
  // }

  // Stop a running app
  public async stopApp(appId: number) {
    const { data } = await Api.post("/app/stop-app", { appId });
    return data;
  }

  // // Restart a running app
  // public async restartApp(
  //   appId: number,
  //   onOutput: (output: AppOutput) => void,
  //   removeNodeModules?: boolean,
  // ): Promise<{ success: boolean }> {
  //   try {
  //     const result = await this.ipcRenderer.invoke("restart-app", {
  //       appId,
  //       removeNodeModules,
  //     });
  //     this.appStreams.set(appId, { onOutput });
  //     return result;
  //   } catch (error) {
  //     showError(error);
  //     throw error;
  //   }
  // }

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

  public async addAppToFavorite(appId: number) {
    try {
      const { data } = await Api.post("/app/add-to-favorite", { appId });
      return data;
    } catch (error) {
      showError(error);
      throw error;
    }
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
  }): Promise<void> {
    await this.ipcRenderer.invoke("rename-app", {
      appId,
      appName,
      appPath,
    });
  }

  // Reset all - removes all app files, settings, and drops the database
  public async resetAll(): Promise<void> {
    await this.ipcRenderer.invoke("reset-all");
  }

  async checkAppName(params: { appName: string }) {
    const config: AxiosRequestConfig = { params };
    const { data } = await Api.get("/app/check-app-name", { config });
    return data;
  }

  public async addDependency({
    chatId,
    packages,
  }: {
    chatId: number;
    packages: string[];
  }): Promise<void> {
    await this.ipcRenderer.invoke("chat:add-dep", {
      chatId,
      packages,
    });
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
