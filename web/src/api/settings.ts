import Api from "./api";
import { AxiosRequestConfig } from "axios";
import { NodeSystemInfo } from "@/shared/easyTypes";
import { UserSettings } from "@/shared/schemas";

class SettingsApiService {
  // Method to get user budget information
  public async getUserBudget() {
    const { data } = await Api.get("/settings/get-user-budget");
    return data;
  }

  // Get user settings
  public async getUserSettings() {
    const { data } = await Api.get("/settings/get-user-settings");
    return data as UserSettings;
  }
  // Update user settings
  public async setUserSettings(settings: Partial<UserSettings>) {
    const { data } = await Api.patch("/settings/set-user-settings", settings);
    return data as UserSettings;
  }

  // Get allow-listed environment variables
  public async getEnvVars() {
    const { data } = await Api.get("/settings/get-env-vars");
    return data as Record<string, string | undefined>;
  }
  public async reloadEnvPath(): Promise<void> {
    // await this.ipcRenderer.invoke("reload-env-path");
    window.location.reload();
  }
  // Check Node.js and npm status
  public async getNodejsStatus() {
    const { data } = await Api.get("/settings/nodejs-status");
    return data as NodeSystemInfo;
  }
}

const settingsApi = new SettingsApiService();
export default settingsApi;
