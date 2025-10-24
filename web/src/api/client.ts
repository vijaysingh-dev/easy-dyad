import {
  ChatResponseEnd,
  Message,
  AppOutput,
  GitHubDeviceFlowUpdateData,
  GitHubDeviceFlowSuccessData,
  GitHubDeviceFlowErrorData,
} from "@shared/eeziTypes";

export interface AppStreamCallbacks {
  onOutput: (output: AppOutput) => void;
}

export interface ChatStreamCallbacks {
  onUpdate: (messages: Message[]) => void;
  onEnd: (response: ChatResponseEnd) => void;
  onError: (error: string) => void;
}

export interface HelpStreamCallbacks {
  onChunk: (delta: string) => void;
  onEnd: () => void;
  onError: (error: string) => void;
}

export interface GithubStreamCallbacks {
  onGithubDeviceFlowUpdate: (data: GitHubDeviceFlowUpdateData) => void;
  onGithubDeviceFlowSuccess: (data: GitHubDeviceFlowSuccessData) => void;
  onGithubDeviceFlowError: (data: GitHubDeviceFlowErrorData) => void;
}

class EeziClient {
  public baseURL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";

  // Streams
  public chatStreams = new Map<number, ChatStreamCallbacks>();
  public appStreams = new Map<number, AppStreamCallbacks>();
  public helpStreams = new Map<string, HelpStreamCallbacks>();
  public mcpConsentHandlers = new Map<string, (payload: any) => void>();
  public githubStreams = new Map<number, GithubStreamCallbacks>();

  // EventSource connections per type
  public eventSources: {
    chat?: EventSource;
    app?: EventSource;
    help?: EventSource;
    mcp?: EventSource;
    github?: EventSource;
  } = {};

  constructor() {}

  // ----------------------------
  // Generic SSE Initializer
  // ----------------------------
  private initEventSource(
    key: keyof typeof this.eventSources,
    url: string,
    onData: (data: any) => void
  ) {
    if (this.eventSources[key]) return; // already connected
    const es = new EventSource(url);
    this.eventSources[key] = es;

    es.onopen = () => {
      console.info(`[${key}] SSE connected`);
    };

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onData(data);
      } catch (err) {
        console.error(`[${key}] Failed to parse SSE data:`, event.data, err);
      }
    };

    es.onerror = (err) => {
      console.error(`[${key}] SSE error:`, err);
      es.close();
      this.eventSources[key] = undefined;
    };

    this.eventSources[key] = es;
  }

  // Chat Stream
  public initChatStreamSSE(url: string) {
    this.initEventSource("chat", url, (data) => {
      switch (data.eventType) {
        case "chat:response:chunk": {
          const { chatId, messages } = data;
          this.chatStreams.get(chatId)?.onUpdate(messages);
          break;
        }
        case "chat:response:end": {
          const { chatId } = data;
          this.chatStreams.get(chatId)?.onEnd(data as ChatResponseEnd);
          this.chatStreams.delete(chatId);
          break;
        }
        case "chat:response:error": {
          const { chatId, error } = data;
          this.chatStreams.get(chatId)?.onError(error);
          this.chatStreams.delete(chatId);
          break;
        }
        case "mcp:tool-consent-request": {
          const { chatId } = data;
          this.mcpConsentHandlers.get("consent")?.(data);
          break;
        }
        default:
          console.warn("[chat] Unknown event type:", data.eventType);
      }
    });
  }

  // App Output Stream
  public initAppStreamSSE(url: string) {
    this.initEventSource("app", url, (data) => {
      if (data.eventType === "app:output") {
        console.log("[app] Output received:", data);
        const { appId, type, message } = data as AppOutput;
        this.appStreams
          .get(appId)
          ?.onOutput({ appId, type, message, timestamp: Date.now() });
      } else if (data.eventType === "app:error") {
        console.error(`[app] Error for app ${data.appId}:`, data.error);
      } else {
        console.warn("[app] Unknown event type:", data.eventType);
      }
    });
  }

  // Help Bot Stream
  public initHelpStreamSSE(url: string) {
    this.initEventSource("help", url, (data) => {
      switch (data.eventType) {
        case "help:chat:response:chunk": {
          const { sessionId, delta } = data;
          this.helpStreams.get(sessionId)?.onChunk(delta);
          break;
        }
        case "help:chat:response:end": {
          const { sessionId } = data;
          this.helpStreams.get(sessionId)?.onEnd();
          this.helpStreams.delete(sessionId);
          break;
        }
        case "help:chat:response:error": {
          const { sessionId, error } = data;
          this.helpStreams.get(sessionId)?.onError(error);
          this.helpStreams.delete(sessionId);
          break;
        }
        default:
          console.warn("[help] Unknown event type:", data.eventType);
      }
    });
  }

  // MCP Stream
  public initMcpStreamSSE(key: string) {
    this.initEventSource("mcp", key, (data) => {
      if (data.eventType === "mcp:tool-consent-request") {
        this.mcpConsentHandlers.get("consent")?.(data.payload);
      } else {
        console.warn("[mcp] Unknown event type:", data.eventType);
      }
    });
  }

  // Github Stream
  public initGithubStreamSSE(url: string) {
    this.initEventSource("github", url, (data) => {
      if (data.eventType === "github:flow-update") {
        this.githubStreams.get(data.appId)?.onGithubDeviceFlowUpdate(data);
      } else if (data.eventType == "github:flow-success") {
        this.githubStreams.get(data.appId)?.onGithubDeviceFlowSuccess(data);
      } else if (data.eventType == "github:flow-error") {
        this.githubStreams.get(data.appId)?.onGithubDeviceFlowError(data);
      } else {
        console.warn("[github] Unknown event type:", data.eventType);
      }
    });
  }

  // ----------------------------
  // Utilities
  // ----------------------------
  public reconnectNow(type: keyof typeof this.eventSources, url: string) {
    this.eventSources[type]?.close();
    this.eventSources[type] = undefined;
    switch (type) {
      case "chat":
        this.initChatStreamSSE(url);
        break;
      case "app":
        this.initAppStreamSSE(url);
        break;
      case "help":
        this.initHelpStreamSSE(url);
        break;
      case "mcp":
        this.initMcpStreamSSE(url);
        break;
      case "github":
        this.initGithubStreamSSE(url);
        break;
    }
  }

  public closeAllConnections() {
    Object.entries(this.eventSources).forEach(([key, es]) => {
      es?.close();
      console.log(`[${key}] SSE closed manually`);
    });
    this.eventSources = {};
  }
}

const eeziClient = new EeziClient();
export default eeziClient;
