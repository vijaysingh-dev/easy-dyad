import { ChatResponseEnd, Message, AppOutput } from "@shared/eeziTypes";

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

class EeziClient {
  private baseURL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";

  // Streams
  public chatStreams = new Map<number, ChatStreamCallbacks>();
  public appStreams = new Map<number, AppStreamCallbacks>();
  public helpStreams = new Map<string, HelpStreamCallbacks>();
  public mcpConsentHandlers = new Map<string, (payload: any) => void>();

  // EventSource connections per type
  public eventSources: {
    chat?: EventSource;
    app?: EventSource;
    help?: EventSource;
    mcp?: EventSource;
  } = {};

  // Retry management
  private retryCounts: Record<string, number> = {
    chat: 0,
    app: 0,
    help: 0,
    mcp: 0,
  };
  private maxRetryDelay = 30000;

  constructor() {}

  // ----------------------------
  // Generic SSE Initializer
  // ----------------------------
  private initEventSource(
    key: keyof typeof this.eventSources,
    streamId: string | number,
    onData: (data: any) => void
  ) {
    if (this.eventSources[key]) return; // already connected
    const url = `${this.baseURL}/${key}/stream/${streamId}`;
    const es = new EventSource(url);

    es.onopen = () => {
      console.info(`[${key}] SSE connected`);
      this.retryCounts[key] = 0;
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
      this.retryConnection(key, streamId, onData);
    };

    this.eventSources[key] = es;
  }

  private retryConnection(
    key: keyof typeof this.eventSources,
    streamId: string | number,
    onData: (data: any) => void
  ) {
    this.retryCounts[key]++;
    const delay = Math.min(1000 * 2 ** (this.retryCounts[key] - 1), this.maxRetryDelay);
    console.warn(`[${key}] Retrying connection in ${delay / 1000}s...`);

    setTimeout(() => {
      this.initEventSource(key, streamId, onData);
    }, delay);
  }

  // ----------------------------
  // Chat Stream
  // ----------------------------
  public initChatStreamSSE(chatId: number) {
    this.initEventSource("chat", chatId.toString(), (data) => {
      switch (data.type) {
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
        default:
          console.warn("[chat] Unknown event type:", data.type);
      }
    });
  }

  // ----------------------------
  // App Output Stream
  // ----------------------------
  public initAppStreamSSE(appId: number) {
    this.initEventSource("app", appId.toString(), (data) => {
      if (data.type === "app:output") {
        const { appId, type, message } = data as AppOutput;
        this.appStreams
          .get(appId)
          ?.onOutput({ appId, type, message, timestamp: Date.now() });
      }
    });
  }

  public registerAppStream(appId: number, callbacks: AppStreamCallbacks) {
    this.appStreams.set(appId, callbacks);
    if (!this.eventSources.app) {
      this.initAppStreamSSE(appId);
    }
  }

  // ----------------------------
  // Help Bot Stream
  // ----------------------------
  public initHelpStreamSSE(helpId: string) {
    this.initEventSource("help", helpId, (data) => {
      switch (data.type) {
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
          console.warn("[help] Unknown event type:", data.type);
      }
    });
  }

  public registerHelpStream(sessionId: string, callbacks: HelpStreamCallbacks) {
    this.helpStreams.set(sessionId, callbacks);
    if (!this.eventSources.help) {
      this.initHelpStreamSSE(sessionId);
    }
  }

  // ----------------------------
  // MCP Stream
  // ----------------------------
  public initMcpStreamSSE(key: string) {
    this.initEventSource("mcp", key, (data) => {
      if (data.type === "mcp:tool-consent-request") {
        this.mcpConsentHandlers.get("consent")?.(data.payload);
      } else {
        console.warn("[mcp] Unknown event type:", data.type);
      }
    });
  }

  public registerMcpConsentHandler(key: string, handler: (payload: any) => void) {
    this.mcpConsentHandlers.set(key, handler);
    if (!this.eventSources.mcp) {
      this.initMcpStreamSSE(key);
    }
  }

  // ----------------------------
  // Utilities
  // ----------------------------
  public reconnectNow(type: keyof typeof this.eventSources, streamId: string | number) {
    this.eventSources[type]?.close();
    this.retryCounts[type] = 0;
    this.eventSources[type] = undefined;
    switch (type) {
      case "chat":
        this.initChatStreamSSE(streamId as number);
        break;
      case "app":
        this.initAppStreamSSE(streamId as number);
        break;
      case "help":
        this.initHelpStreamSSE(streamId as string);
        break;
      case "mcp":
        this.initMcpStreamSSE(streamId as string);
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
