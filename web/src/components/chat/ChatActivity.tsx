import { useEffect, useMemo, useState } from "react";

import { Bell, Loader2, CheckCircle2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ChatSummary } from "@shared/schemas";
import { useAtomValue } from "jotai";
import { isStreamingByIdAtom, recentStreamChatIdsAtom } from "@/atoms/chatAtoms";
import { useLoadApps } from "@/hooks/useLoadApps";
import { useSelectChat } from "@/hooks/useSelectChat";
import { useI18n } from "@/lib/i18n";
import api from "@/api";

export function ChatActivityButton() {
  const { t, dir } = useI18n();
  const [open, setOpen] = useState(false);
  const isStreamingById = useAtomValue(isStreamingByIdAtom);
  const isAnyStreaming = useMemo(() => {
    for (const v of isStreamingById.values()) {
      if (v) return true;
    }
    return false;
  }, [isStreamingById]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              dir={dir}
              className="no-app-region-drag relative flex items-center justify-center p-1.5 rounded-md text-sm hover:bg-[var(--background-darkest)] transition-colors"
              data-testid="chat-activity-button"
            >
              {isAnyStreaming && (
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span className="block size-7 rounded-full border-3 border-blue-500/60 border-t-transparent animate-spin" />
                </span>
              )}
              <Bell size={16} />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent dir={dir}>{t("Recent chat activity")}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-80 p-0 max-h-[50vh] overflow-y-auto">
        <ChatActivityList onSelect={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

function ChatActivityList({ onSelect }: { onSelect?: () => void }) {
  const { t, dir } = useI18n();
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const isStreamingById = useAtomValue(isStreamingByIdAtom);
  const recentStreamChatIds = useAtomValue(recentStreamChatIdsAtom);
  const apps = useLoadApps();
  const { selectChat } = useSelectChat();

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const all = await api.chat.getAllChats();
        if (!mounted) return;
        const recent = Array.from(recentStreamChatIds)
          .map((id) => all.find((c) => c.id === id))
          .filter((c) => c !== undefined);
        // Sort recent first
        setChats([...recent].reverse());
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [recentStreamChatIds]);

  const rows = useMemo(() => chats.slice(0, 30), [chats]);

  if (loading) {
    return (
      <div
        dir={dir}
        className="p-4 text-sm text-muted-foreground flex items-center gap-2"
      >
        <Loader2 size={16} className="animate-spin" />
        {t("Loading activity…")}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div dir={dir} className="p-4 text-sm text-muted-foreground">
        {t("No recent chats")}
      </div>
    );
  }

  return (
    <div dir={dir} className="py-1" data-testid="chat-activity-list">
      {rows.map((c) => {
        const inProgress = isStreamingById.get(c.id) === true;
        return (
          <button
            key={c.id}
            dir={dir}
            className="w-full text-left px-3 py-2 flex items-center justify-between gap-2 rounded-md hover:bg-[var(--background-darker)] dark:hover:bg-[var(--background-lighter)] transition-colors"
            onClick={() => {
              onSelect?.();
              selectChat({ chatId: c.id, appId: c.appId });
            }}
            data-testid={`chat-activity-list-item-${c.id}`}
          >
            <div className="min-w-0">
              <div dir={dir} className="truncate text-sm font-medium">
                {c.title ?? t("Chat id", { id: c.id })}
              </div>
              <div dir={dir} className="text-xs text-muted-foreground">
                {apps.apps.find((a) => a.id === c.appId)?.name}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {inProgress ? (
                <div dir={dir} className="flex items-center text-purple-600">
                  <Loader2 size={16} className="animate-spin" />
                </div>
              ) : (
                <div dir={dir} className="flex items-center text-emerald-600">
                  <CheckCircle2 size={16} />
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
