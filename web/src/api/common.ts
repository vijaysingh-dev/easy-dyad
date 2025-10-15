import Api from "./api";
import { AxiosRequestConfig } from "axios";

class CommonApiService {
  async getAllChoices(choice: string, qParams = { nested: false }) {
    const config: AxiosRequestConfig = { params: qParams };

    return Api.get(`core/choices/${choice}/`, { config })
      .then((res) => Promise.resolve(res))
      .catch((err) => Promise.reject(err));
  }


}

const CommonApi = new CommonApiService();
export default CommonApi;
