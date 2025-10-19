import {
  ChatProblemsEvent,
  ChatResponseEnd,
  ComponentSelection,
  FileAttachment,
  Message,
  UpdateChatParams,
} from "@shared/eeziTypes";
import {
  ChatSummariesSchema,
  ChatSearchResult,
  ChatSearchResultsSchema,
} from "@shared/schemas";
import { AxiosRequestConfig } from "axios";
import { showError } from "@/components/Toast";
import eeziClient from "./client";
import Api from "./api";

class ChatApiService {
  // Get all chats
  public async getAllChats(appId?: number) {
    try {
      const config: AxiosRequestConfig = { params: { appId } };
      if (!appId) delete config.params.appId;

      const { data } = await Api.get("/chat/get-chats", { config });
      return ChatSummariesSchema.parse(data);
    } catch (error) {
      showError(error);
      throw error;
    }
  }

  public async getChat(chatId: number) {
    try {
      const { data } = await Api.get(`/chat/get-chat/:${chatId}`);
      return data;
    } catch (error) {
      showError(error);
      throw error;
    }
  }

  public async updateChat(params: UpdateChatParams) {
    const config: AxiosRequestConfig = { params };
    const { data } = await Api.patch("/chat/update-chat", { config });
    return data;
  }

  public async deleteChat(chatId: number) {
    const { data } = await Api.delete(`/chat/delete-chat/:${chatId}`);
    return data;
  }

  public async deleteMessages(chatId: number) {
    // await this.ipcRenderer.invoke("delete-messages", chatId);
    const { data } = await Api.delete(`/chat/delete-messages/:${chatId}`);
    return data;
  }

  // search for chats
  public async searchChats(appId: number, query: string): Promise<ChatSearchResult[]> {
    try {
      const config: AxiosRequestConfig = { params: { query } };
      const { data } = await Api.get(`/chat/search-chats/:${appId}`, { config });
      return ChatSearchResultsSchema.parse(data);
    } catch (error) {
      showError(error);
      throw error;
    }
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
    }
  ): void {
    const { chatId, redo, attachments, selectedComponent, onUpdate, onEnd, onError } =
      options;

    eeziClient.chatStreams.set(chatId, { onUpdate, onEnd, onError });
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
              })
          )
        )
      : Promise.resolve([]);

    processAttachments
      .then((fileDataArray) =>
        Api.post(`/${chatId}/stream`, {
          prompt,
          redo,
          selectedComponent,
          attachments: fileDataArray,
        })
          .then((res) => {
            if (!eeziClient.eventSources.chat) {
              const url = eeziClient.baseURL + `/stream/${chatId}`;
              eeziClient.initChatStreamSSE(url);
            }
          })
          .catch((err) => {
            showError(err);
            onError(String(err));
            eeziClient.chatStreams.delete(chatId);
          })
      )
      .catch((err) => {
        showError(err);
        onError(String(err));
        eeziClient.chatStreams.delete(chatId);
      });
  }

  public cancelChatStream(chatId: number): void {
    Api.delete(`/${chatId}/cancel`);
    eeziClient.chatStreams.delete(chatId);
  }
}

const chatApi = new ChatApiService();
export default chatApi;
