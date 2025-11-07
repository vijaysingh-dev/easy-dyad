import React, { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wrench } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useMcp } from "@/hooks/useMcp";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function McpToolsPicker() {
  const { t, dir } = useI18n();
  const { servers, toolsByServer, consentsMap, setToolConsent } = useMcp();

  const [isOpen, setIsOpen] = useState(false);

  // Removed activation toggling – consent governs execution time behavior

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="has-[>svg]:px-2"
                size="sm"
                data-testid="mcp-tools-button"
              >
                <Wrench className="size-4" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>{t("Tools")}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PopoverContent
        className="w-120 max-h-[80vh] overflow-y-auto"
        align="start"
        dir={dir}
      >
        <div className="space-y-4">
          <div>
            <h3 className="font-medium">{t("Tools (MCP)")}</h3>
            <p className="text-sm text-muted-foreground">
              {t("Enable tools from your configured MCP servers.")}
            </p>
          </div>
          {servers.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
              {t("No MCP servers configured. Configure them in Settings → Tools (MCP).")}
            </div>
          ) : (
            <div className="space-y-3">
              {servers.map((s) => (
                <div key={s.id} className="border rounded-md p-2">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-sm truncate">{s.name}</div>
                    {s.enabled ? (
                      <Badge variant="secondary">{t("Enabled")}</Badge>
                    ) : (
                      <Badge variant="outline">{t("Disabled")}</Badge>
                    )}
                  </div>
                  <div className="mt-2 space-y-1">
                    {(toolsByServer[s.id] || []).map((tItem) => (
                      <div
                        key={tItem.name}
                        className="flex items-center justify-between gap-2 rounded border p-2"
                      >
                        <div className="min-w-0">
                          <div className="font-mono text-sm truncate">{tItem.name}</div>
                          {tItem.description && (
                            <div className="text-xs text-muted-foreground truncate">
                              {tItem.description}
                            </div>
                          )}
                        </div>
                        <Select
                          value={
                            consentsMap[`${s.id}:${tItem.name}`] ||
                            tItem.consent ||
                            "ask"
                          }
                          onValueChange={(v) =>
                            setToolConsent(s.id, tItem.name, v as any)
                          }
                        >
                          <SelectTrigger className="w-[140px] h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ask">{t("Ask")}</SelectItem>
                            <SelectItem value="always">{t("Always allow")}</SelectItem>
                            <SelectItem value="denied">{t("Deny")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                    {(toolsByServer[s.id] || []).length === 0 && (
                      <div className="text-xs text-muted-foreground">
                        {t("No tools discovered.")}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
