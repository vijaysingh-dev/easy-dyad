import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";

class ApiService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:8000",
      headers: { "Content-Type": "application/json" },
    });
  }

  // Generic GET method with optional headers
  async get(
    endpoint: string,
    { config = {} }: { config?: AxiosRequestConfig } = {}
  ): Promise<AxiosResponse> {
    config.withCredentials = true;
    return this.api
      .get(endpoint, config)
      .then((res) => Promise.resolve(res))
      .catch((err) => Promise.reject(err));
  }

  // Generic POST method with optional headers
  async post(
    endpoint: string,
    data: object,
    { config = {} }: { config?: AxiosRequestConfig } = {}
  ): Promise<AxiosResponse> {
    config.withCredentials = true;
    return this.api
      .post(endpoint, data, config)
      .then((res) => Promise.resolve(res))
      .catch((err) => Promise.reject(err));
  }

  // Generic PATCH method with optional headers
  async patch(
    endpoint: string,
    data: object,
    { config = {} }: { config?: AxiosRequestConfig } = {}
  ): Promise<AxiosResponse> {
    config.withCredentials = true;
    return this.api
      .patch(endpoint, data, config)
      .then((res) => Promise.resolve(res))
      .catch((err) => Promise.reject(err));
  }

  // Generic DELETE method with optional headers
  async delete(
    endpoint: string,
    { config = {} }: { config?: AxiosRequestConfig } = {}
  ): Promise<AxiosResponse> {
    config.withCredentials = true;

    return this.api
      .delete(endpoint, config)
      .then((res) => Promise.resolve(res))
      .catch((err) => Promise.reject(err));
  }
}

// Initialize an instance
const Api = new ApiService();
export default Api;
