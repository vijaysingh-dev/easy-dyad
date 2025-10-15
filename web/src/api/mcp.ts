import Api from "./api";
import { AxiosRequestConfig } from "axios";

class McpApiService {
  async getAllChoices(choice: string, qParams = { nested: false }) {
    const config: AxiosRequestConfig = { params: qParams };

    return Api.get(`core/choices/${choice}/`, { config })
      .then((res) => Promise.resolve(res))
      .catch((err) => Promise.reject(err));
  }


}

const mcpApi = new McpApiService();
export default mcpApi;
