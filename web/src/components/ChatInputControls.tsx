import { ContextFilesPicker } from "./ContextFilesPicker";
import { ModelPicker } from "./ModelPicker";
import { ProModeSelector } from "./ProModeSelector";
import { ChatModeSelector } from "./ChatModeSelector";
import { McpToolsPicker } from "@/components/McpToolsPicker";
import { useSettings } from "@/hooks/useSettings";
import { useI18n } from "@/lib/i18n";

export function ChatInputControls({
  showContextFilesPicker = false,
}: {
  showContextFilesPicker?: boolean;
}) {
  const { dir } = useI18n();
  const { settings } = useSettings();

  return (
    <div className="flex" dir={dir}>
      <ChatModeSelector />
      {settings?.selectedChatMode === "agent" && (
        <>
          <div className="w-1.5"></div>
          <McpToolsPicker />
        </>
      )}
      <div className="w-1.5"></div>
      <ModelPicker />
      <div className="w-1.5"></div>
      <ProModeSelector />
      <div className="w-1"></div>
      {showContextFilesPicker && (
        <>
          <ContextFilesPicker />
          <div className="w-0.5"></div>
        </>
      )}
    </div>
  );
}
