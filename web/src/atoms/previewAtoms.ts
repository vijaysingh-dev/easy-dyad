import { ComponentSelection } from "@shared/eeziTypes";
import { atom } from "jotai";

export const selectedComponentPreviewAtom = atom<ComponentSelection | null>(
  null,
);
