import Api from './api';
export interface AppStreamCallbacks {
  onOutput: (output: AppOutput) => void;
}
export interface ChatStreamCallbacks {
  onUpdate: (messages: Message[]) => void;
  onEnd: (response: ChatResponseEnd) => void;
  onError: (error: string) => void;
}


export interface HelpStreamCallbacks {
  onUpdate: (message: string) => void;
  onEnd: () => void;
  onError: (error: string) => void;
}
export interface GitHubDeviceFlowUpdateData {
  userCode?: string;
  verificationUri?: string;
  message?: string;
}

export interface GitHubDeviceFlowSuccessData {
  message?: string;
}

export interface GitHubDeviceFlowErrorData {
  error: string;
}

export interface DeepLinkData {
  type: string;
}

interface DeleteCustomModelParams {
  providerId: string;
  modelApiName: string;
}
export type EeziClientType = {
  getSystemPlatform(): Promise<string>;
  getAppVersion(): Promise<string>;
  getSystemDebugInfo(): Promise<SystemDebugInfo>;
  getNodejsStatus(): Promise<NodeSystemInfo>;
  openExternalUrl(url: string): Promise<void>;
  showItemInFolder(fullPath: string): Promise<void>;
  minimizeWindow(): Promise<void>;
  maximizeWindow(): Promise<void>;
  closeWindow(): Promise<void>;
  createApp(params: CreateAppParams): Promise<CreateAppResult>;
  getApp(appId: number): Promise<App>;
  listApps(): Promise<ListAppsResponse>;
  searchApps(searchQuery: string): Promise<AppSearchResult[]>;
  addAppToFavorite(appId: number): Promise<{ isFavorite: boolean }>;
  deleteApp(appId: number): Promise<void>;
  copyApp(params: CopyAppParams): Promise<{ app: App }>;
  renameApp(params: { appId: number; appName: string; appPath: string }): Promise<void>;
  importApp(params: ImportAppParams): Promise<ImportAppResult>;
  checkAppName(params: { appName: string }): Promise<{ exists: boolean }>;
  runApp(appId: number, onOutput: (output: AppOutput) => void): Promise<void>;
  stopApp(appId: number): Promise<void>;
  restartApp(appId: number, onOutput: (output: AppOutput) => void, removeNodeModules?: boolean): Promise<{ success: boolean }>;
  respondToAppInput(params: RespondToAppInputParams): Promise<void>;
  readAppFile(appId: number, filePath: string): Promise<string>;
  editAppFile(appId: number, filePath: string, content: string): Promise<EditAppFileReturnType>;
  getAppEnvVars(params: GetAppEnvVarsParams): Promise<{ key: string; value: string }[]>;
  setAppEnvVars(params: SetAppEnvVarsParams): Promise<void>;
  createChat(prompt: string, options: {
    chatId?: number;
    onUpdate: (messages: Message[]) => void;
    onEnd: (response: ChatResponseEnd) => void;
    onError: (error: string) => void;
    appId?: number;
    attachments?: FileAttachment[];
  }): Promise<void>;
  listChats(): Promise<Chat[]>;
  getChat(chatId: number): Promise<Chat>;
  deleteChat(chatId: number): Promise<void>;
  searchChats(searchQuery: string): Promise<ChatSearchResult[]>;
  summarizeChat(chatId: number): Promise<ChatSummary>;
  reportChatProblems(chatId: number, problems: ProblemReport[]): Promise<void>;
  getTokenCount(params: TokenCountParams): Promise<TokenCountResult>;
};
import type {
  ChatSummary,
  ChatSearchResult,
  AppSearchResult,
  UserSettings,
  ContextPathResults,
  AppChatContext,
} from "../lib/schemas";
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
} from "@shared/types";

/**
 * The main Eezi client class implementing a singleton pattern for making HTTP requests
 * to the server API.
 */
export default class EeziClient {
  private readonly chatStreams = new Map<number, ChatStreamCallbacks>();
  private readonly appStreams = new Map<number, AppStreamCallbacks>();
  private readonly helpStreams = new Map<string, HelpStreamCallbacks>();
  private static instance: EeziClient;

  private constructor() {}



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
}

// Export singleton instance and type
export type EeziClient = EeziClientSingleton;
export const eeziClient = EeziClientSingleton.getInstance();
import type { ChatStreamCallbacks, AppStreamCallbacks, HelpStreamCallbacks } from './types';

export class EeziClient {
  // Singleton instance management
  private static instance?: EeziClient;

  public static getInstance(): EeziClient {
    if (!EeziClient.instance) {
      EeziClient.instance = new EeziClient();
    }
    return EeziClient.instance;
  }

  // Stream management
  protected readonly chatStreams = new Map<number, ChatStreamCallbacks>();
  protected readonly appStreams = new Map<number, AppStreamCallbacks>();
  protected readonly helpStreams = new Map<string, HelpStreamCallbacks>();

  // Private constructor
  private constructor() {}

class EeziClientSingleton {
  protected readonly chatStreams = new Map<number, ChatStreamCallbacks>();
  protected readonly appStreams = new Map<number, AppStreamCallbacks>();
  protected readonly helpStreams = new Map<string, HelpStreamCallbacks>();

  private static instance: EeziClientSingleton | null = null;

  private constructor() {}

  public static getInstance(): EeziClientSingleton {
    if (!EeziClientSingleton.instance) {
      EeziClientSingleton.instance = new EeziClientSingleton();
    }
    return EeziClientSingleton.instance;
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

  // Chat Creation
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

export interface ChatStreamCallbacks {
  onUpdate: (messages: Message[]) => void;
  onEnd: (response: ChatResponseEnd) => void;
  onError: (error: string) => void;
}

export interface AppStreamCallbacks {
  onOutput: (output: AppOutput) => void;
}

class EeziClient {
  private chatStreams: Map<number, ChatStreamCallbacks>;
  private appStreams: Map<number, AppStreamCallbacks>;

  constructor() {
    this.chatStreams = new Map();
    this.appStreams = new Map();
  }

  // App-related endpoints
  async createApp(params: CreateAppParams): Promise<CreateAppResult> {
    const { data } = await Api.post('apps/create', params);
    return data;
  }

  async getApp(appId: number): Promise<App> {
    const { data } = await Api.get(`apps/${appId}`);
    return data;
  }

  async addAppToFavorite(appId: number): Promise<{ isFavorite: boolean }> {
    const { data } = await Api.post(`apps/${appId}/favorite`, {});
    return data;
  }

  async getAppEnvVars(params: GetAppEnvVarsParams): Promise<{ key: string; value: string }[]> {
    const { data } = await Api.get(`apps/${params.appId}/env-vars`);
    return data;
  }

  async setAppEnvVars(params: SetAppEnvVarsParams): Promise<void> {
    await Api.post(`apps/${params.appId}/env-vars`, params.envVars);
  }

  // Chat-related endpoints
  async getChat(chatId: number): Promise<Chat> {
    const { data } = await Api.get(`chats/${chatId}`);
    return data;
  }

  async getChats(appId?: number): Promise<ChatSummary[]> {
    const { data } = await Api.get(appId ? `chats?appId=${appId}` : 'chats');
    return data;
  }

  async searchChats(appId: number, query: string): Promise<ChatSearchResult[]> {
    const { data } = await Api.get(`chats/search?appId=${appId}&query=${encodeURIComponent(query)}`);
    return data;
  }

  // App listing and search
  async listApps(): Promise<ListAppsResponse> {
    const { data } = await Api.get('apps');
    return data;
  }

  async searchApps(searchQuery: string): Promise<AppSearchResult[]> {
    const { data } = await Api.get(`apps/search?query=${encodeURIComponent(searchQuery)}`);
    return data;
  }

  // File operations
  async readAppFile(appId: number, filePath: string): Promise<string> {
    const { data } = await Api.get(`apps/${appId}/files?path=${encodeURIComponent(filePath)}`);
    return data;
  }

  async editAppFile(appId: number, filePath: string, content: string): Promise<EditAppFileReturnType> {
    const { data } = await Api.post(`apps/${appId}/files`, {
      path: filePath,
      content
    });
    return data;
  }

  // Release notes
  async doesReleaseNoteExist(params: DoesReleaseNoteExistParams): Promise<{ exists: boolean; url?: string }> {
    const { data } = await Api.get(`version/does-release-note-exist?version=${encodeURIComponent(params.version)}`);
    return data;
  }

  // Chat streaming
  streamMessage(
    prompt: string,
    options: {
      selectedComponent: ComponentSelection | null;
      chatId: number;
      redo?: boolean;
      attachments?: FileAttachment[];
      onUpdate: (messages: Message[]) => void;
      onEnd: (response: ChatResponseEnd) => void;
      onError: (error: string) => void;
      onProblems?: (problems: ChatProblemsEvent) => void;
    }
  ): void {
    const { chatId, onUpdate, onEnd, onError } = options;
    this.chatStreams.set(chatId, { onUpdate, onEnd, onError });

    if (options.attachments && options.attachments.length > 0) {
      // Use fetch for streaming with attachments
      this.streamWithAttachments(prompt, options);
    } else {
      // Use EventSource for simple streaming
      this.streamWithEventSource(prompt, options);
    }
  }

  private async streamWithAttachments(prompt: string, options: any) {
    const { chatId, attachments } = options;
    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('chatId', chatId.toString());
    if (options.selectedComponent) {
      formData.append('selectedComponent', JSON.stringify(options.selectedComponent));
    }
    if (options.redo) {
      formData.append('redo', 'true');
    }
    attachments?.forEach((att: FileAttachment, index: number) => {
      formData.append(`attachment${index}`, new Blob([att.content]), att.name);
    });

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        body: formData
      });

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader available');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));
            const callbacks = this.chatStreams.get(chatId);
            if (callbacks) {
              if ('error' in data) {
                callbacks.onError(data.error);
                this.chatStreams.delete(chatId);
              } else if ('end' in data) {
                callbacks.onEnd(data);
                this.chatStreams.delete(chatId);
              } else {
                callbacks.onUpdate(data.messages);
              }
            }
          }
        }
      }
    } catch (error) {
      const callbacks = this.chatStreams.get(chatId);
      if (callbacks) {
        callbacks.onError(error instanceof Error ? error.message : 'Unknown error');
        this.chatStreams.delete(chatId);
      }
    }
  }

  private streamWithEventSource(prompt: string, options: any) {
    const { chatId } = options;
    const params = new URLSearchParams({
      prompt,
      chatId: chatId.toString()
    });
    if (options.selectedComponent) {
      params.append('selectedComponent', JSON.stringify(options.selectedComponent));
    }
    if (options.redo) {
      params.append('redo', 'true');
    }

    const eventSource = new EventSource(`/api/chat/stream?${params.toString()}`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const callbacks = this.chatStreams.get(chatId);
      if (callbacks) {
        callbacks.onUpdate(data.messages);
      }
    };

    eventSource.addEventListener('end', (event) => {
      const callbacks = this.chatStreams.get(chatId);
      if (callbacks) {
        callbacks.onEnd(JSON.parse(event.data));
        this.chatStreams.delete(chatId);
      }
      eventSource.close();
    });

    eventSource.onerror = () => {
      const callbacks = this.chatStreams.get(chatId);
      if (callbacks) {
        callbacks.onError('Stream connection error');
        this.chatStreams.delete(chatId);
      }
      eventSource.close();
    };
  }

  // Cancel chat stream
  async cancelChatStream(chatId: number): Promise<void> {
    await Api.post(`chat/${chatId}/cancel`, {});
    const callbacks = this.chatStreams.get(chatId);
    if (callbacks) {
      this.chatStreams.delete(chatId);
    }
  }
}

// Create and export a singleton instance
const eeziClient = new EeziClient();
export default eeziClient;