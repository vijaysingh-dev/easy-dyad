import { atom, useAtom, useAtomValue } from "jotai";
import { useEffect } from "react";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { chatsAtom, chatsLoadingAtom } from "@/atoms/chatAtoms";
import type { ChatSummary } from "@shared/schemas";
import api from "@/api";

const chatListAtom = atom(async (get) => {
  const selectedAppId = get(selectedAppIdAtom);
  return await api.chat.getAllChats(selectedAppId || undefined);
});

export function useChats(appId: number | null) {
  const [chatList] = useAtom(chatListAtom);
  const [chats, setChats] = useAtom(chatsAtom);
  const [loading, setLoading] = useAtom(chatsLoadingAtom);

  useEffect(() => {
    const fetchChats = async () => {
      try {
        setLoading(true);
        setChats(chatList);
      } catch (error) {
        console.error("Failed to load chats:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchChats();
  }, [chatList, setChats, setLoading]);

  const refreshChats = async () => {
    try {
      setLoading(true);
      const chatListResponse = await api.chat.getAllChats(appId || undefined);
      setChats(chatListResponse);
      return chatListResponse;
    } catch (error) {
      console.error("Failed to refresh chats:", error);
      return [] as ChatSummary[];
    } finally {
      setLoading(false);
    }
  };

  return { chats, loading, refreshChats };
}
