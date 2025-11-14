import Api from "./api";
import { AxiosRequestConfig } from "axios";
import { showError } from "@/components/Toast";
import { DoesReleaseNoteExistParams, RevertVersionParams } from "@/shared/eeziTypes";

class VersionApiService {
  async doesReleaseNoteExist(params: DoesReleaseNoteExistParams) {
    const config: AxiosRequestConfig = { params };
    const { data } = await Api.get("/version/does-release-note-exist", { config });
    return data;
  }

  // List all versions (commits) of an app
  public async listVersions(appId: number) {
    try {
      const { data } = await Api.get(`/version/list-versions/${appId}`);
      return data;
    } catch (error) {
      showError(error);
      throw error;
    }
  }

  // Revert to a specific version
  public async revertVersion(params: RevertVersionParams) {
    const { data } = await Api.post("/version/revert-version", params);
    return data;
  }

  // Checkout a specific version without creating a revert commit
  public async checkoutVersion(params: { appId: number; versionId: string }) {
    const { data } = await Api.post("/version/checkout-version", params);
    return data;
  }

  // Get the current branch of an app
  public async getCurrentBranch(appId: number) {
    const { data } = await Api.get(`/version/get-current-branch/${appId}`);
    return data;
  }
}

const versionApi = new VersionApiService();
export default versionApi;
