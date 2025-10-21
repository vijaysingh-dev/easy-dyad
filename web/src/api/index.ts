import appApi from "./app";
import chatApi from "./chat";
import llmApi from "./llm";
import integrationApi from "./integration";
import mcpApi from "./mcp";
import settingsApi from "./settings";
import versionApi from "./version";

const api = {
  app: appApi,
  chat: chatApi,
  llm: llmApi,
  integration: integrationApi,
  mcp: mcpApi,
  settings: settingsApi,
  version: versionApi,
};

export default api;
