import Api from './api';
import type { ChatStreamCallbacks, AppStreamCallbacks, HelpStreamCallbacks } from './types';
import type {
  App,
  AppOutput,
  AppUpgrade,
  BranchResult,
  Chat,
  ChatResponseEnd,
  ChatProblemsEvent,
  ComponentSelection,
  CreateAppParams,
  CreateAppResult,
  DoesReleaseNoteExistParams,
  EditAppFileReturnType,
  FileAttachment,
  GetAppEnvVarsParams,
  ListAppsResponse,
  Message,
  NodeSystemInfo,
  ProblemReport,
  RespondToAppInputParams,
  SetAppEnvVarsParams,
  SystemDebugInfo,
  TokenCountParams,
  TokenCountResult,
  Version,
  LanguageModelProvider,
  LanguageModel,
  CreateCustomLanguageModelProviderParams,
  CreateCustomLanguageModelParams,
  LocalModel,
  McpServerUpdate,
  CreateMcpServer,
  ImportAppParams,
  ImportAppResult,
  RenameBranchParams,
  CopyAppParams,
  PromptDto,
  CreatePromptParamsDto,
  UpdatePromptParamsDto,
  RevertVersionParams,
  RevertVersionResponse,
  UserBudgetInfo
} from "../lib/ipc_types";
import type {
  ChatSummary,
  ChatSearchResult,
  AppSearchResult,
  UserSettings,
  ContextPathResults,
  AppChatContext,
} from "../lib/schemas";

class EeziClient {
  private readonly chatStreams = new Map<number, ChatStreamCallbacks>();
  private readonly appStreams = new Map<number, AppStreamCallbacks>();
  private readonly helpStreams = new Map<string, HelpStreamCallbacks>();

  private static instance?: EeziClient;

  private constructor() {}

  public static getInstance(): EeziClient {
    if (!EeziClient.instance) {
      EeziClient.instance = new EeziClient();
    }
    return EeziClient.instance;
  }

  // System Methods
  async getSystemPlatform(): Promise<string> {
    const { data } = await Api.get('system/platform');
    return data;
  }

  async getAppVersion(): Promise<string> {
    const { data } = await Api.get('system/version');
    return data.version;
  }

  async getSystemDebugInfo(): Promise<SystemDebugInfo> {
    const { data } = await Api.get('system/debug-info');
    return data;
  }

  async getNodejsStatus(): Promise<NodeSystemInfo> {
    const { data } = await Api.get('system/nodejs-status');
    return data;
  }

  async openExternalUrl(url: string): Promise<void> {
    await Api.post('system/open-url', { url });
  }

  async showItemInFolder(fullPath: string): Promise<void> {
    await Api.post('system/show-in-folder', { path: fullPath });
  }

  async minimizeWindow(): Promise<void> {
    await Api.post('window/minimize', {});
  }

  async maximizeWindow(): Promise<void> {
    await Api.post('window/maximize', {});
  }

  async closeWindow(): Promise<void> {
    await Api.post('window/close', {});
  }

  // App Methods
  async createApp(params: CreateAppParams): Promise<CreateAppResult> {
    const { data } = await Api.post('apps/create', params);
    return data;
  }

  async getApp(appId: number): Promise<App> {
    const { data } = await Api.get(`apps/${appId}`);
    return data;
  }

  async listApps(): Promise<ListAppsResponse> {
    const { data } = await Api.get('apps');
    return data;
  }

  async searchApps(searchQuery: string): Promise<AppSearchResult[]> {
    const { data } = await Api.get(`apps/search?query=${encodeURIComponent(searchQuery)}`);
    return data;
  }

  async addAppToFavorite(appId: number): Promise<{ isFavorite: boolean }> {
    const { data } = await Api.post(`apps/${appId}/favorite`, {});
    return data;
  }

  async deleteApp(appId: number): Promise<void> {
    await Api.delete(`apps/${appId}`);
  }

  async copyApp(params: CopyAppParams): Promise<{ app: App }> {
    const { data } = await Api.post('apps/copy', params);
    return data;
  }

  async renameApp({ appId, appName, appPath }: { appId: number; appName: string; appPath: string }): Promise<void> {
    await Api.post(`apps/${appId}/rename`, { appName, appPath });
  }

  async importApp(params: ImportAppParams): Promise<ImportAppResult> {
    const { data } = await Api.post('apps/import', params);
    return data;
  }

  async checkAppName(params: { appName: string }): Promise<{ exists: boolean }> {
    const { data } = await Api.get(`apps/check-name?name=${encodeURIComponent(params.appName)}`);
    return data;
  }

  // App Running and Files
  async runApp(appId: number, onOutput: (output: AppOutput) => void): Promise<void> {
    this.appStreams.set(appId, { onOutput });
    await Api.post(`apps/${appId}/run`, {});
  }

  async stopApp(appId: number): Promise<void> {
    await Api.post(`apps/${appId}/stop`, {});
  }

  async restartApp(appId: number, onOutput: (output: AppOutput) => void, removeNodeModules?: boolean): Promise<{ success: boolean }> {
    this.appStreams.set(appId, { onOutput });
    const { data } = await Api.post(`apps/${appId}/restart`, { removeNodeModules });
    return data;
  }

  async respondToAppInput(params: RespondToAppInputParams): Promise<void> {
    await Api.post(`apps/${params.appId}/input`, { response: params.response });
  }

  async readAppFile(appId: number, filePath: string): Promise<string> {
    const { data } = await Api.get(`apps/${appId}/files?path=${encodeURIComponent(filePath)}`);
    return data;
  }

  async editAppFile(appId: number, filePath: string, content: string): Promise<EditAppFileReturnType> {
    const { data } = await Api.post(`apps/${appId}/files`, { path: filePath, content });
    return data;
  }

  // App Environment Variables
  async getAppEnvVars(params: GetAppEnvVarsParams): Promise<{ key: string; value: string }[]> {
    const { data } = await Api.get(`apps/${params.appId}/env-vars`);
    return data;
  }

  async setAppEnvVars(params: SetAppEnvVarsParams): Promise<void> {
    await Api.post(`apps/${params.appId}/env-vars`, params.envVars);
  }

  // Chat Methods
  async createChat(prompt: string, options: {
    chatId?: number;
    onUpdate: (messages: Message[]) => void;
    onEnd: (response: ChatResponseEnd) => void;
    onError: (error: string) => void;
    appId?: number;
    attachments?: FileAttachment[];
  }): Promise<void> {
    const { chatId, onUpdate, onEnd, onError, appId, attachments } = options;

    if (chatId) {
      this.chatStreams.set(chatId, { onUpdate, onEnd, onError });
    }

    if (attachments?.length) {
      await this.createChatWithAttachments(prompt, { chatId, appId, attachments, onUpdate, onEnd, onError });
    } else {
      await this.createChatWithEventSource(prompt, { chatId, appId, onUpdate, onEnd, onError });
    }
  }

  private async createChatWithAttachments(prompt: string, options: {
    chatId?: number;
    appId?: number;
    attachments: FileAttachment[];
    onUpdate: (messages: Message[]) => void;
    onEnd: (response: ChatResponseEnd) => void;
    onError: (error: string) => void;
  }) {
    const { chatId, appId, attachments, onUpdate, onEnd, onError } = options;

    try {
      const formData = new FormData();
      formData.append('prompt', prompt);

      if (chatId) {
        formData.append('chatId', chatId.toString());
      }

      if (appId) {
        formData.append('appId', appId.toString());
      }

      attachments.forEach((attachment, index) => {
        const blob = new Blob([attachment.content], { type: 'text/plain' });
        formData.append(`file${index}`, blob, attachment.name);
      });

      const response = await Api.post('chats/create', formData);
      onUpdate(response.data.messages);
      onEnd(response.data);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Unknown error occurred');
    }
  }

  private async createChatWithEventSource(prompt: string, options: {
    chatId?: number;
    appId?: number;
    onUpdate: (messages: Message[]) => void;
    onEnd: (response: ChatResponseEnd) => void;
    onError: (error: string) => void;
  }) {
    const { chatId, appId, onUpdate, onEnd, onError } = options;

    try {
      const params = new URLSearchParams();
      params.append('prompt', prompt);

      if (chatId) {
        params.append('chatId', chatId.toString());
      }

      if (appId) {
        params.append('appId', appId.toString());
      }

      const eventSource = new EventSource(`/api/chats/stream?${params.toString()}`);

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        onUpdate(data.messages);
      };

      eventSource.addEventListener('end', (event) => {
        const data = JSON.parse((event as MessageEvent).data);
        onEnd(data);
        eventSource.close();
      });

      eventSource.onerror = (error) => {
        onError(error instanceof Error ? error.message : 'Error in chat stream');
        eventSource.close();
      };
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Failed to create chat stream');
    }
  }

  async listChats(): Promise<Chat[]> {
    const { data } = await Api.get('chats');
    return data;
  }

  async getChat(chatId: number): Promise<Chat> {
    const { data } = await Api.get(`chats/${chatId}`);
    return data;
  }

  async deleteChat(chatId: number): Promise<void> {
    await Api.delete(`chats/${chatId}`);
  }

  async searchChats(searchQuery: string): Promise<ChatSearchResult[]> {
    const { data } = await Api.get(`chats/search?query=${encodeURIComponent(searchQuery)}`);
    return data;
  }

  async summarizeChat(chatId: number): Promise<ChatSummary> {
    const { data } = await Api.get(`chats/${chatId}/summary`);
    return data;
  }

  async reportChatProblems(chatId: number, problems: ProblemReport[]): Promise<void> {
    await Api.post(`chats/${chatId}/problems`, { problems });
  }

  // Token Count
  async getTokenCount(params: TokenCountParams): Promise<TokenCountResult> {
    const { data } = await Api.post('chats/token-count', params);
    return data;
  }
  async getChats(appId?: number) {
    const url = appId ? `chat/get-chats?appId=${appId}` : `chat/get-chats`;
    const res = await Api.get(url, { useAuth: false });
    return res.data.result;
  }

  // Prompts
  async listPrompts(): Promise<PromptDto[]> {
    const res = await Api.get("prompts/", { useAuth: false });
    return res.data.result;
  }

  async createPrompt(params: CreatePromptParamsDto): Promise<PromptDto> {
    const res = await Api.post("prompts/create", params, { useAuth: false });
    return res.data.result;
  }

  async updatePrompt(params: UpdatePromptParamsDto): Promise<void> {
    await Api.post("prompts/update", params, { useAuth: false });
  }

  async deletePrompt(id: number): Promise<void> {
    await Api.post("prompts/delete", { id }, { useAuth: false });
  }

  // StreamMessage: supports EventSource (no attachments) and fetch POST (with attachments)
  streamMessage(
    prompt: string,
    options: {
      chatId: number;
      redo?: boolean;
      attachments?: {
        name: string;
        type: string;
        data: string;
        attachmentType: string;
      }[];
      selectedComponent?: any;
      onUpdate: (messages: Message[]) => void;
      onEnd: (response: ChatResponseEnd) => void;
      onError: (error: string) => void;
    }
  ) {
    const { chatId, attachments, onUpdate, onEnd, onError } = options;
    this.chatStreams.set(chatId, { onUpdate, onEnd, onError });

    // If attachments are present, use POST streaming via fetch
    if (attachments && attachments.length > 0) {
      const controller = new AbortController();
      const body = {
        prompt,
        chatId,
        redo: options.redo,
        attachments,
        selectedComponent: options.selectedComponent,
      };
      fetch(`/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
        .then(async (resp) => {
          if (!resp.body) throw new Error("No response body");
          const reader = resp.body.getReader();
          const decoder = new TextDecoder();
          let buf = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            let lines = buf.split("\n\n");
            buf = lines.pop() || "";
            for (const line of lines) {
              if (line.startsWith("data:")) {
                const payload = JSON.parse(line.replace(/^data:\s*/, ""));
                const cb = this.chatStreams.get(chatId);
                if (cb)
                  cb.onUpdate(
                    payload.messages ?? [{ role: "assistant", content: payload.chunk }]
                  );
              } else if (line.startsWith("event: end")) {
                const cb = this.chatStreams.get(chatId);
                if (cb) cb.onEnd({ chatId });
                this.chatStreams.delete(chatId);
              }
            }
          }
        })
        .catch((err) => {
          const cb = this.chatStreams.get(chatId);
          if (cb) cb.onError(String(err));
          this.chatStreams.delete(chatId);
        });
      return;
    }

    // Else, use EventSource (SSE) for simple streaming
    const params = new URLSearchParams({ chatId: String(chatId), prompt });
    const es = new EventSource(`/api/chat/stream?${params.toString()}`);
    es.onmessage = (ev) => {
      try {
        const payload = JSON.parse(ev.data);
        const cb = this.chatStreams.get(chatId);
        if (cb)
          cb.onUpdate(
            payload.messages ?? [{ role: "assistant", content: payload.chunk }]
          );
      } catch (e) {
        // ignore parse errors
      }
    };
    es.addEventListener("end", () => {
      const cb = this.chatStreams.get(chatId);
      if (cb) cb.onEnd({ chatId });
      es.close();
      this.chatStreams.delete(chatId);
    });
    es.onerror = (err) => {
      const cb = this.chatStreams.get(chatId);
      if (cb) cb.onError("SSE error");
      es.close();
      this.chatStreams.delete(chatId);
    };
  }

  cancelChatStream(chatId: number) {
    // Call cancel endpoint
    Api.post("chat/cancel", { chatId }, { useAuth: false }).catch(() => {});
    this.chatStreams.delete(chatId);
  }
}

export type { EeziClient };
export const eeziClient = EeziClient.getInstance();
