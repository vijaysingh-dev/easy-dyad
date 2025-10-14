import { jwtDecode } from "jwt-decode";
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";

export function getTokenExpiry(token: string) {
  try {
    const { exp } = jwtDecode(token);
    return Math.max(exp - Math.floor(Date.now() / 1000), 0) * 1000;
  } catch (error) {
    console.error("Invalid/Expired token:", error);
    return 0;
  }
}

class ApiService {
  private api: AxiosInstance;
  private access: string;
  private refresh: string;

  constructor() {
    this.api = axios.create({
      baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/",
      headers: { "Content-Type": "application/json" },
    });

    this.access = localStorage.getItem("access") || "";
    this.refresh = localStorage.getItem("refresh") || "";

    if (this.access) this.clearTokenOnExpiry("access", this.access);
    if (this.refresh) this.clearTokenOnExpiry("refresh", this.refresh);
  }

  private clearTokenOnExpiry(type: string, token: string) {
    const tokenExpiry = getTokenExpiry(token);
    setTimeout(() => {
      if (type == "refresh") this.logout();
      else {
        this.access = "";
        localStorage.removeItem(type);
      }
    }, tokenExpiry);
  }

  async login(payload) {
    return this.api
      .post("token/", payload)
      .then((res) => {
        this.access = res.data.access;
        localStorage.setItem("access", this.access);
        this.clearTokenOnExpiry("access", this.access);

        this.refresh = res.data.refresh;
        localStorage.setItem("refresh", this.refresh);
        this.clearTokenOnExpiry("refresh", this.refresh);
        return Promise.resolve("Success!");
      })
      .catch((err) => {
        return Promise.reject(err);
      });
  }

  logout() {
    this.access = "";
    this.refresh = "";
    localStorage.clear();
  }

  private async getAccessToken() {
    if (this.access.length != 0) return Promise.resolve(this.access);
    if (this.refresh.length == 0) {
      localStorage.clear();
      return Promise.reject("Session Timeout");
    }
    return this.api
      .post("token/refresh/", { refresh: this.refresh })
      .then((res) => {
        this.access = res.data.access;
        localStorage.setItem("access", this.access);
        this.clearTokenOnExpiry("access", this.access);
        return Promise.resolve(this.access);
      })
      .catch((err) => {
        return Promise.reject(err);
      });
  }

  // Generic GET method with optional headers
  async get(
    endpoint: string,
    { useAuth = true, config = {} }: { useAuth?: boolean; config?: AxiosRequestConfig } = {}
  ): Promise<AxiosResponse> {
    if (useAuth) {
      try {
        const token = await this.getAccessToken();
        config.headers = { ...config.headers, Authorization: "Bearer " + token };
      } catch (err) {
        return Promise.reject(err);
      }
    }
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
    { useAuth = true, config = {} }: { useAuth?: boolean; config?: AxiosRequestConfig } = {}
  ): Promise<AxiosResponse> {
    if (useAuth) {
      try {
        const token = await this.getAccessToken();
        config.headers = { ...config.headers, Authorization: "Bearer " + token };
      } catch (err) {
        return Promise.reject(err);
      }
    }
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
    { useAuth = true, config = {} }: { useAuth?: boolean; config?: AxiosRequestConfig } = {}
  ): Promise<AxiosResponse> {
    if (useAuth) {
      try {
        const token = await this.getAccessToken();
        config.headers = { ...config.headers, Authorization: "Bearer " + token };
      } catch (err) {
        return Promise.reject(err);
      }
    }
    config.withCredentials = true;

    return this.api
      .patch(endpoint, data, config)
      .then((res) => Promise.resolve(res))
      .catch((err) => Promise.reject(err));
  }

  // Generic DELETE method with optional headers
  async delete(
    endpoint: string,
    { useAuth = true, config = {} }: { useAuth?: boolean; config?: AxiosRequestConfig } = {}
  ): Promise<AxiosResponse> {
    if (useAuth) {
      try {
        const token = await this.getAccessToken();
        config.headers = { ...config.headers, Authorization: "Bearer " + token };
      } catch (err) {
        return Promise.reject(err);
      }
    }
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
