import type { Message, ChatResponseEnd, AppOutput } from '../lib/ipc_types';

export interface ChatStreamCallbacks {
  onUpdate: (messages: Message[]) => void;
  onEnd: (response: ChatResponseEnd) => void;
  onError: (error: string) => void;
}

export interface AppStreamCallbacks {
  onOutput: (output: AppOutput) => void;
}

export interface HelpStreamCallbacks {
  onUpdate: (message: string) => void;
  onEnd: () => void;
  onError: (error: string) => void;
}