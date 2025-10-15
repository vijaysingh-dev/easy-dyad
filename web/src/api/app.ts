import Api from "./api";
import { AxiosRequestConfig } from "axios";
import { CreateAppParams, CreateAppResult, ListAppsResponse } from "@shared/eeziTypes";

class AppApiService {
  // Open an external URL using the default browser
  openExternalUrl(url: string) {
    const newTab = window.open(url, "_blank");
    newTab?.focus();
  }
  async reloadEnvPath() {
    return Promise.resolve(()=>setTimeout(() => {
      window.location.reload();
    }, 1000));
  }
  // Get all apps
  async listApps() {
    const { data } = await Api.get(`app/list-apps`);
    return data as ListAppsResponse;
  }

  // Create a new app with an initial chat
  async createApp(params: CreateAppParams) {
    const config: AxiosRequestConfig = { params };
    const { data } = await Api.get(`app/create-app`, { config });
    return data as CreateAppResult;
  }
}

const appApi = new AppApiService();
export default appApi;
