import Api from "./api";
import { AxiosRequestConfig } from "axios";

import { DoesReleaseNoteExistParams } from "@shared/eeziTypes";

class VersionApiService {
  async doesReleaseNoteExist(params: DoesReleaseNoteExistParams) {
    const config: AxiosRequestConfig = { params };
    const { data } = await Api.get("does-release-note-exist", { config });
    return data;
  }
  // Get the main app version
  public async getAppVersion(): Promise<string> {
    const { data } = await Api.get("get-app-version");
    return data.version as string;
  }

}

const versionApi = new VersionApiService();
export default versionApi;
