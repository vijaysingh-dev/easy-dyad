import Api from "./api";
import { AxiosRequestConfig } from "axios";

import { DoesReleaseNoteExistParams } from "@shared/eeziTypes";

class VersionApiService {
  //   async getAllChoices(choice: string, qParams = { nested: false }) {
  //     const config: AxiosRequestConfig = { params: qParams };

  //     return Api.get(`core/choices/${choice}/`, { config })
  //       .then((res) => Promise.resolve(res))
  //       .catch((err) => Promise.reject(err));
  //   }

  async doesReleaseNoteExist(params: DoesReleaseNoteExistParams) {
    const config: AxiosRequestConfig = { params };
    const { data } = await Api.get("does-release-note-exist", { config });
    return data;
  }
}

const versionApi = new VersionApiService();
export default versionApi;
