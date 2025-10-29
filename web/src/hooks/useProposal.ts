import { useState, useEffect, useCallback } from "react";
import type { ProposalResult } from "@shared/schemas"; // Import Proposal type
import { selectedChatIdAtom } from "@/atoms/chatAtoms";
import { proposalResultAtom } from "@/atoms/proposalAtoms";
import { atom, useAtom, useSetAtom } from "jotai";
import api from "@/api";

const proposalAtom = atom(async (get) => {
  const chatId = get(selectedChatIdAtom);
  if (chatId === null) return null;
  return await api.chat.getProposal(chatId);
});

export function useProposal(chatId?: number | undefined) {
  const setSelectedChatId = useSetAtom(selectedChatIdAtom);
  const [proposalResult, setProposalResult] = useAtom(proposalResultAtom);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [proposalData] = useAtom(proposalAtom);
  useEffect(() => {
    const fetchProposal = async () => {
      try {
        setIsLoading(true);
        if (chatId === undefined) return;
        setSelectedChatId(chatId);
        setProposalResult(proposalData);
      } catch (err: any) {
        console.error("Error fetching proposal:", err);
        setError(err.message || "Failed to fetch proposal");
        setProposalResult(null); // Clear proposal data on error
      } finally {
        setIsLoading(false);
      }
    };
    fetchProposal();
  }, [chatId, setSelectedChatId]);

  const refreshProposal = useCallback(
    async (overrideChatId?: number) => {
      chatId = overrideChatId ?? chatId;
      if (chatId === undefined) return;
      setSelectedChatId(chatId);
      try {
        setIsLoading(true);
        const result = (await api.chat.getProposal(chatId)) as ProposalResult | null;
        setProposalResult(result);
      } catch (err: any) {
        console.error("Error fetching proposal:", err);
        setError(err.message || "Failed to fetch proposal");
        setProposalResult(null); // Clear proposal data on error
      } finally {
        setIsLoading(false);
      }
    },
    [chatId, setSelectedChatId]
  );

  return {
    proposalResult: proposalResult,
    isLoading,
    error,
    refreshProposal,
  };
}
