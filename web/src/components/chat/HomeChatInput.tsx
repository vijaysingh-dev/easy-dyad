import { useI18n } from "@/lib/i18n";
import { SendIcon, StopCircleIcon } from "lucide-react";

import { useSettings } from "@/hooks/useSettings";
import { homeChatInputValueAtom } from "@/atoms/chatAtoms"; // Use a different atom for home input
import { useAtom } from "jotai";
import { useStreamChat } from "@/hooks/useStreamChat";
import { useAttachments } from "@/hooks/useAttachments";
import { AttachmentsList } from "./AttachmentsList";
import { DragDropOverlay } from "./EeziDropOverlay";
import { FileAttachmentDropdown } from "./FileAttachmentDropdown";
import { usePostHog } from "posthog-js/react";
import { HomeSubmitOptions } from "@/pages/home";
import { ChatInputControls } from "../ChatInputControls";
import { LexicalChatInput } from "./LexicalChatInput";
import { useChatModeToggle } from "@/hooks/useChatModeToggle";
export function HomeChatInput({
  onSubmit,
}: {
  onSubmit: (options?: HomeSubmitOptions) => void;
}) {
  const { t, dir } = useI18n();
  const posthog = usePostHog();
  const [inputValue, setInputValue] = useAtom(homeChatInputValueAtom);
  const { settings } = useSettings();
  const { isStreaming } = useStreamChat({
    hasChatId: false,
  }); // eslint-disable-line @typescript-eslint/no-unused-vars
  useChatModeToggle();

  // Use the attachments hook
  const {
    attachments,
    isDraggingOver,
    handleFileSelect,
    removeAttachment,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    clearAttachments,
    handlePaste,
  } = useAttachments();

  // Custom submit function that wraps the provided onSubmit
  const handleCustomSubmit = () => {
    if ((!inputValue.trim() && attachments.length === 0) || isStreaming) {
      return;
    }

    // Call the parent's onSubmit handler with attachments
    onSubmit({ attachments });

    // Clear attachments as part of submission process
    clearAttachments();
    posthog.capture("chat:home_submit");
  };

  if (!settings) {
    return null; // Or loading state
  }

  return (
    <>
      <div className="p-4" data-testid="home-chat-input-container" dir={dir}>
        <div
          className={`relative flex flex-col space-y-2 border border-border rounded-lg bg-(--background-lighter) shadow-sm ${
            isDraggingOver ? "ring-2 ring-blue-500 border-blue-500" : ""
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          dir={dir}
        >
          {/* Attachments list */}
          <AttachmentsList attachments={attachments} onRemove={removeAttachment} />

          {/* Drag and drop overlay */}
          <DragDropOverlay isDraggingOver={isDraggingOver} />

          <div className="flex items-start space-x-2 " dir={dir}>
            <LexicalChatInput
              value={inputValue}
              onChange={setInputValue}
              onSubmit={handleCustomSubmit}
              onPaste={handlePaste}
              placeholder={t("Ask Eezi to build...")}
              disabled={isStreaming}
              excludeCurrentApp={false}
            />

            {/* File attachment dropdown */}
            <FileAttachmentDropdown
              className="mt-1 mr-1"
              onFileSelect={handleFileSelect}
              disabled={isStreaming}
            />

            {isStreaming ? (
              <button
                className="px-2 py-2 mt-1 mr-2 text-(--sidebar-accent-fg) rounded-lg opacity-50 cursor-not-allowed"
                title={t("Cancel generation (unavailable here)")}
                dir={dir}
              >
                <StopCircleIcon size={20} />
              </button>
            ) : (
              <button
                onClick={handleCustomSubmit}
                disabled={!inputValue.trim() && attachments.length === 0}
                className="px-2 py-2 mt-1 mr-2 hover:bg-(--background-darkest) text-(--sidebar-accent-fg) rounded-lg disabled:opacity-50"
                title={t("Send message")}
                dir={dir}
              >
                <SendIcon size={20} />
              </button>
            )}
          </div>
          <div className="px-2 pb-2" dir={dir}>
            <ChatInputControls />
          </div>
        </div>
      </div>
    </>
  );
}
