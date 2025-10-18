import Api from "./api";
import { AxiosRequestConfig } from "axios";
import {
  CreateAppParams,
  CreateAppResult,
  ListAppsResponse,
  CreatePromptParamsDto,
  UpdatePromptParamsDto,
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
  // Get all apps
  async listApps() {
    const { data } = await Api.get(`/app/list-apps`);
    return data as ListAppsResponse;
  }

  public async getApp(appId: number) {
    const { data } = await Api.get(`/app/get-app/${appId}`);
    return data;
  }

  // Create a new app with an initial chat
  async createApp(params: CreateAppParams) {
    const config: AxiosRequestConfig = { params };
    const { data } = await Api.get(`/app/create-app`, { config });
    return data as CreateAppResult;
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
