import { ComponentSelection } from "@/shared/easyTypes";
import { atom } from "jotai";

export const selectedComponentPreviewAtom = atom<ComponentSelection | null>(null);
