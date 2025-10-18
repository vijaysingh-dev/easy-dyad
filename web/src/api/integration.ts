import Api from "./api";
import { AxiosRequestConfig } from "axios";
import { DeepLinkData } from "@shared/eeziTypes";

class IntegrationApiService {
  async getAllChoices(choice: string, qParams = { nested: false }) {
    const config: AxiosRequestConfig = { params: qParams };

    return Api.get(`core/choices/${choice}/`, { config })
      .then((res) => Promise.resolve(res))
      .catch((err) => Promise.reject(err));
  }
  // --- Neon Management ---
  public async fakeHandleNeonConnect() {
    return Api.get("/neon/fake-connect");
  }
  // Listen for deep link events
  public onDeepLinkReceived(
    callback: (data: DeepLinkData) => void,
  ) {
    const listener = (data: any) => {
      callback(data as DeepLinkData);
    };
    this.fakeHandleNeonConnect().then((data) => {
      listener(data);
    });
  }
  // public async createNeonProject(
  //   params: CreateNeonProjectParams,
  // ): Promise<NeonProject> {
  //   return this.ipcRenderer.invoke("neon:create-project", params);
  // }

  // public async getNeonProject(
  //   params: GetNeonProjectParams,
  // ): Promise<GetNeonProjectResponse> {
  //   return this.ipcRenderer.invoke("neon:get-project", params);
  // }

  // // --- End Neon Management ---

}

const integrationApi = new IntegrationApiService();
export default integrationApi;
