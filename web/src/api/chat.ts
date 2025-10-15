import Api from "./api";
import { AxiosRequestConfig } from "axios";

class ChatApiService {
  async getAllChoices(choice: string, qParams = { nested: false }) {
    const config: AxiosRequestConfig = { params: qParams };

    return Api.get(`chat/`, { config })
      .then((res) => Promise.resolve(res))
      .catch((err) => Promise.reject(err));
  }


}

const chatApi = new ChatApiService();
export default chatApi;
