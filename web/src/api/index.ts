import appApi from "./app";
import chatApi from "./chat";
import helpApi from "./help";
import integrationApi from "./integration";
import mcpApi from "./mcp";
import settingsApi from "./settings";
import versionApi from "./version";

const api = {
  app: appApi,
  chat: chatApi,
  help: helpApi,
  integration: integrationApi,
  mcp: mcpApi,
  settings: settingsApi,
  version: versionApi,
};

export default api;
