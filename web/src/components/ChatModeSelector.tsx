import {
  MiniSelectTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSettings } from "@/hooks/useSettings";
import type { ChatMode } from "@shared/schemas";
import { cn } from "@/lib/utils";
import { detectIsMac } from "@/hooks/useChatModeToggle";

import { useI18n } from "@/lib/i18n";

export function ChatModeSelector() {
  const { settings, updateSettings } = useSettings();

  const selectedMode = settings?.selectedChatMode || "build";
  const { t, dir } = useI18n();

  const handleModeChange = (value: string) => {
    updateSettings({ selectedChatMode: value as ChatMode });
  };

  const getModeDisplayName = (mode: ChatMode) => {
    switch (mode) {
      case "build":
        return t("Build");
      case "ask":
        return t("Ask");
      case "agent":
        return t("Agent");
      default:
        return t("Build");
    }
  };
  const isMac = detectIsMac();

  return (
    <Select value={selectedMode} onValueChange={handleModeChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <MiniSelectTrigger
            data-testid="chat-mode-selector"
            className={cn(
              "h-6 w-fit px-1.5 py-0 text-xs-sm font-medium shadow-none gap-0.5",
              selectedMode === "build"
                ? "bg-background hover:bg-muted/50 focus:bg-muted/50"
                : "bg-primary/10 hover:bg-primary/20 focus:bg-primary/20 text-primary border-primary/20 dark:bg-primary/20 dark:hover:bg-primary/30 dark:focus:bg-primary/30"
            )}
            size="sm"
            dir={dir}
          >
            <SelectValue dir={dir}>{getModeDisplayName(selectedMode)}</SelectValue>
          </MiniSelectTrigger>
        </TooltipTrigger>
        <TooltipContent dir={dir}>
          <div className="flex flex-col" dir={dir}>
            <span dir={dir}>{t("Open mode menu")}</span>
            <span className="text-xs text-gray-200 dark:text-gray-500" dir={dir}>
              {isMac ? "⌘ + ." : t("Ctrl + . to toggle")}
            </span>
          </div>
        </TooltipContent>
      </Tooltip>
      <SelectContent
        align="start"
        onCloseAutoFocus={(e) => e.preventDefault()}
        dir={dir}
      >
        <SelectItem value="build" dir={dir}>
          <div className="flex flex-col items-start" dir={dir}>
            <span className="font-medium" dir={dir}>
              {t("Build")}
            </span>
            <span className="text-xs text-muted-foreground" dir={dir}>
              {t("Generate and edit code")}
            </span>
          </div>
        </SelectItem>
        <SelectItem value="ask" dir={dir}>
          <div className="flex flex-col items-start" dir={dir}>
            <span className="font-medium" dir={dir}>
              {t("Ask")}
            </span>
            <span className="text-xs text-muted-foreground" dir={dir}>
              {t("Ask questions about the app")}
            </span>
          </div>
        </SelectItem>
        <SelectItem value="agent" dir={dir}>
          <div className="flex flex-col items-start" dir={dir}>
            <span className="font-medium" dir={dir}>
              {t("Agent (experimental)")}
            </span>
            <span className="text-xs text-muted-foreground" dir={dir}>
              {t("Agent can use tools (MCP) and generate code")}
            </span>
          </div>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
