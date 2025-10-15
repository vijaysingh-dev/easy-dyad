import appApi from "./app";
import chatApi from "./chat";
import settingsApi from "./settings";
import integrationApi from "./integration";
import mcpApi from "./mcp";
import versionApi from "./version";

const api = {
  app: appApi,
  chat: chatApi,
  settings: settingsApi,
  integration: integrationApi,
  mcp: mcpApi,
  version: versionApi,
};

export default api;
