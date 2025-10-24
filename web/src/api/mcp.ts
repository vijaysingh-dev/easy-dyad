import Api from "./api";
import { CreateMcpServer, McpServerUpdate } from "@shared/eeziTypes";
import eeziClient from "./client";

class McpApiService {
  public async listMcpServers() {
    const { data } = await Api.get("/mcp/list-servers");
    return data;
  }

  public async createMcpServer(params: CreateMcpServer) {
    const { data } = await Api.post("/mcp/create-server", params);
    return data;
  }

  public async updateMcpServer(params: McpServerUpdate) {
    const { data } = await Api.patch("/mcp/update-server", params);
    return data;
  }

  public async deleteMcpServer(id: number) {
    const { data } = await Api.delete(`/mcp/delete-server/${id}`);
    return data;
  }

  public async listMcpTools(serverId: number) {
    const { data } = await Api.get(`/mcp/list-tools/${serverId}`);
    return data;
  }

  // Removed: upsertMcpTools and setMcpToolActive – tools are fetched dynamically at runtime

  public async getMcpToolConsents() {
    const { data } = await Api.get("/mcp/get-tool-consents");
    return data;
  }

  public async setMcpToolConsent(params: {
    serverId: number;
    toolName: string;
    consent: "ask" | "always" | "denied";
  }) {
    const { data } = await Api.post("/mcp/set-tool-consent", params);
    return data;
  }

  public onMcpToolConsentRequest(
    handler: (payload: {
      requestId: string;
      serverId: number;
      serverName: string;
      toolName: string;
      toolDescription?: string | null;
      inputPreview?: string | null;
    }) => void
  ) {
    eeziClient.mcpConsentHandlers.set("consent", handler as any);
    return () => {
      eeziClient.mcpConsentHandlers.delete("consent");
    };
  }

  public async respondToMcpConsentRequest(
    requestId: string,
    decision: "accept-once" | "accept-always" | "decline"
  ) {
    const { data } = await Api.post("/mcp/tool-consent-response", {
      requestId,
      decision,
    });
    return data;
  }
}

const mcpApi = new McpApiService();
export default mcpApi;
