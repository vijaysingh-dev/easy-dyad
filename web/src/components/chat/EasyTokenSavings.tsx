import { useI18n } from "@/lib/i18n";
import React from "react";
import { Zap } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";

interface EasyTokenSavingsProps {
  originalTokens: number;
  smartContextTokens: number;
}

export const EasyTokenSavings: React.FC<EasyTokenSavingsProps> = ({
  originalTokens,
  smartContextTokens,
}) => {
  const { t, dir } = useI18n();
  const tokensSaved = originalTokens - smartContextTokens;
  const percentageSaved = Math.round((tokensSaved / originalTokens) * 100);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="bg-green-50 dark:bg-green-950 hover:bg-green-100 dark:hover:bg-green-900 rounded-lg px-4 py-2 border border-green-200 dark:border-green-800 my-2 cursor-pointer"
          dir={dir}
        >
          <div
            className="flex items-center gap-2 text-green-700 dark:text-green-300"
            dir={dir}
          >
            <Zap size={16} className="text-green-600 dark:text-green-400" />
            <span className="text-xs font-medium" dir={dir}>
              {t("Saved percent of codebase tokens with Smart Context", {
                percent: percentageSaved,
              })}
            </span>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" align="center">
        <div className="text-left" dir={dir}>
          {t("Saved tokens", { tokens: Math.round(tokensSaved).toLocaleString() })}
        </div>
      </TooltipContent>
    </Tooltip>
  );
};
