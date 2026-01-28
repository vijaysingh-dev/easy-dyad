import {
  ChatProblemsEvent,
  ChatResponseEnd,
  ComponentSelection,
  FileAttachment,
  Message,
  UpdateChatParams,
  TokenCountParams,
  TokenCountResult,
} from "@/shared/easyTypes";
import {
  ChatSummariesSchema,
  ChatSearchResult,
  ChatSearchResultsSchema,
  ProposalResult,
  AppChatContext,
} from "@/shared/schemas";
import { AxiosRequestConfig } from "axios";
import easyClient from "./client";
import Api from "./api";

class ChatApiService {
  // Get all chats
  public async getAllChats(appId?: string) {
    const config: AxiosRequestConfig = { params: { appId } };
    if (!appId) delete config.params.appId;

    const { data } = await Api.get("/chat/get-chats", { config });
    return ChatSummariesSchema.parse(data);
  }

  public async getChat(chatId: number) {
    const { data } = await Api.get(`/chat/get-chat/${chatId}`);
    return data;
  }

  // Create a new chat for an app
  public async createChat(appId: string) {
    const { data } = await Api.post("/chat/create-chat", { appId });
    return data;
  }

  public async updateChat(params: UpdateChatParams) {
    const config: AxiosRequestConfig = { params };
    const { data } = await Api.patch("/chat/update-chat", { config });
    return data;
  }

  public async deleteChat(chatId: number) {
    const { data } = await Api.delete(`/chat/delete-chat/${chatId}`);
    return data;
  }

  public async deleteMessages(chatId: number) {
    // await this.ipcRenderer.invoke("delete-messages", chatId);
    const { data } = await Api.delete(`/chat/delete-messages/${chatId}`);
    return data;
  }

  // search for chats
  public async searchChats(appId: string, query: string): Promise<ChatSearchResult[]> {
    const config: AxiosRequestConfig = { params: { query } };
    const { data } = await Api.get(`/chat/search-chats/${appId}`, { config });
    return ChatSearchResultsSchema.parse(data);
  }

  public async getChatContextResults(params: { appId: string }) {
    const config: AxiosRequestConfig = { params };
    const { data } = await Api.get("/chat/get-context-paths", { config });
    return data;
  }

  public async setChatContext(params: { appId: string; chatContext: AppChatContext }) {
    const { data } = await Api.post("/chat/set-context-paths", params);
    return data;
  }

  public async addDependency(params: { chatId: number; packages: string[] }) {
    const { data } = await Api.post("/chat/add-dep", params);
    return data;
  }

  // --- Proposal Management ---
  // Get proposal details
  public async getProposal(chatId: number) {
    const { data } = await Api.get(`/chat/get-proposal/${chatId}`);
    // Assuming the main process returns data matching the ProposalResult interface
    // Add a type check/guard if necessary for robustness
    return data as ProposalResult | null;
  }

  // Example methods for listening to events (if needed)
  // public on(channel: string, func: (...args: any[]) => void): void {

  // --- Proposal Management ---
  public async approveProposal(params: { chatId: number; messageId: number }) {
    const { data } = await Api.post("/chat/approve-proposal", params);
    return data;
  }

  public async rejectProposal(params: { chatId: number; messageId: number }) {
    const { data } = await Api.patch("/chat/reject-proposal", params);
    return data;
  }
  // --- End Proposal Management ---

  // Count tokens for a chat and input
  public async countTokens(params: TokenCountParams) {
    const { data } = await Api.post("/chat/count-tokens", params);
    return data as TokenCountResult;
  }

  public streamMessage(
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
    },
  ): void {
    const { chatId, redo, attachments, selectedComponent, onUpdate, onEnd, onError } =
      options;

    // Process file attachments if any
    const processAttachments = attachments
      ? Promise.all(
          attachments.map(
            (attachment) =>
              new Promise<{
                name: string;
                type: string;
                data: string;
                attachmentType: "upload-to-codebase" | "chat-context";
              }>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () =>
                  resolve({
                    name: attachment.file.name,
                    type: attachment.file.type,
                    data: reader.result as string,
                    attachmentType: attachment.type,
                  });
                reader.onerror = () =>
                  reject(new Error(`Failed to read file: ${attachment.file.name}`));
                reader.readAsDataURL(attachment.file);
              }),
          ),
        )
      : Promise.resolve([]);

    processAttachments
      .then((fileDataArray) => {
        Api.post(`/chat/${chatId}/start`, {
          prompt,
          redo,
          selectedComponent,
          attachments: fileDataArray,
        })
          .then((res) => {
            easyClient.chatStreams.set(chatId, { onUpdate, onEnd, onError });
            easyClient.eventSources["chat"]?.close();

            const url = easyClient.baseURL + `/chat/${chatId}/stream`;
            easyClient.initChatStreamSSE(url);
          })
          .catch((err) => {
            onError(String(err));
          });
      })
      .catch((err) => {
        onError(String(err));
      });
  }

  public cancelChatStream(chatId: number): void {
    Api.delete(`/chat/${chatId}/cancel`);
    easyClient.chatStreams.delete(chatId);
  }

  // --- Help bot ---
  public startHelpChat(
    sessionId: string,
    message: string,
    options: {
      onChunk: (delta: string) => void;
      onEnd: () => void;
      onError: (error: string) => void;
    },
  ): void {
    Api.post(`/chat/help/${sessionId}/start`, { message })
      .then(() => {
        easyClient.helpStreams.delete(sessionId);
        easyClient.eventSources["help"]?.close();

        easyClient.helpStreams.set(sessionId, options);
        const url = easyClient.baseURL + `/chat/help/${sessionId}/stream`;
        easyClient.initHelpStreamSSE(url);
      })
      .catch((err) => {
        options.onError(String(err));
      });
  }

  public async cancelHelpChat(sessionId: string): Promise<void> {
    const { data } = await Api.delete(`/chat/help/${sessionId}/cancel`);
    return data;
  }
}

const chatApi = new ChatApiService();
export default chatApi;
