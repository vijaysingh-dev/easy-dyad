import Api from "./api";
import { AxiosRequestConfig } from "axios";
import { NodeSystemInfo } from "@shared/eeziTypes";
import { UserSettings } from "../../../shared/schemas";
import { showError } from "@/components/Toast";

class SettingsApiService {
  // Method to get user budget information
  public async getUserBudget() {
    const { data } = await Api.get("/settings/get-user-budget");
    return data;
  }

  // Get user settings
  public async getUserSettings() {
    try {
      const { data } = await Api.get("/settings/get-user-settings");
      return data as UserSettings;
    } catch (error) {
      showError(error);
      throw error;
    }
  }
  // Update user settings
  public async setUserSettings(settings: Partial<UserSettings>) {
    try {
      const { data } = await Api.patch("/settings/set-user-settings", settings);
      return data as UserSettings;
    } catch (error) {
      showError(error);
      throw error;
    }
  }

  // Get allow-listed environment variables
  public async getEnvVars() {
    try {
      const { data } = await Api.get("/settings/get-env-vars");
      return data as Record<string, string | undefined>;
    } catch (error) {
      showError(error);
      throw error;
    }
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
