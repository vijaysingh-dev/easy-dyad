export class HttpClient {
  private static instance: HttpClient;
  private baseUrl: string;

  private constructor() {
    this.baseUrl = (import.meta as any).env?.VITE_API_BASE_URL || "http://localhost:4000";
  }

  public static getInstance(): HttpClient {
    if (!HttpClient.instance) HttpClient.instance = new HttpClient();
    return HttpClient.instance;
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `HTTP ${res.status}`);
    }
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }

  public createChat(appId: number): Promise<{ chatId: number }> {
    return this.request(`/api/apps/${appId}/chats`, { method: "POST" });
  }
  public deleteApp(appId: number): Promise<void> {
    return this.request(`/api/apps/${appId}`, { method: "DELETE" });
  }
  public renameApp(appId: number, appName: string, appPath: string): Promise<{ app: { id: number; name: string; path: string } }> {
    return this.request(`/api/apps/${appId}`, { method: "PUT", body: JSON.stringify({ appName, appPath }) });
  }
  public copyApp(appId: number, newAppName: string, withHistory: boolean): Promise<{ app: { id: number } }> {
    return this.request(`/api/apps/${appId}/copy`, { method: "POST", body: JSON.stringify({ newAppName, withHistory }) });
  }
}


