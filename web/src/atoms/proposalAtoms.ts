import { atom } from "jotai";
import type { ProposalResult } from "@/shared/schemas";

export const proposalResultAtom = atom<ProposalResult | null>(null);
