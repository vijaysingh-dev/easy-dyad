import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useAtom, useAtomValue } from "jotai";
import { selectedChatIdAtom } from "@/atoms/chatAtoms";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import {
  AlertTriangle,
  XCircle,
  FileText,
  Wrench,
  RefreshCw,
  Check,
} from "lucide-react";
import { Problem, ProblemReport } from "@/shared/easyTypes";
import { Button } from "@/components/ui/button";

import { useStreamChat } from "@/hooks/useStreamChat";
import { useCheckProblems } from "@/hooks/useCheckProblems";
import { createProblemFixPrompt } from "@/shared/problem_prompt";
import { showError } from "@/components/Toast";

interface ProblemItemProps {
  problem: Problem;
}

const ProblemItem = ({ problem }: ProblemItemProps) => {
  const { dir } = useI18n();
  return (
    <div
      dir={dir}
      className="flex items-start gap-3 p-3 border-b border-border hover:bg-[var(--background-darkest)] transition-colors"
    >
      <div className="flex-shrink-0 mt-0.5">
        <XCircle size={16} className="text-red-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <FileText size={14} className="text-muted-foreground flex-shrink-0" />
          <span dir={dir} className="text-sm font-medium truncate">
            {problem.file}
          </span>

          <span dir={dir} className="text-xs text-muted-foreground">
            {problem.line}:{problem.column}
          </span>
        </div>
        <p dir={dir} className="text-sm text-foreground leading-relaxed">
          {problem.message}
        </p>
      </div>
    </div>
  );
};

interface RecheckButtonProps {
  appId: string;
  size?: "sm" | "default" | "lg";
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  className?: string;
}

const RecheckButton = ({
  appId,
  size = "sm",
  variant = "outline",
  className = "h-7 px-3 text-xs",
}: RecheckButtonProps) => {
  const { t, dir } = useI18n();
  const { checkProblems, isChecking } = useCheckProblems(appId);
  const [showingFeedback, setShowingFeedback] = useState(false);

  const handleRecheck = async () => {
    setShowingFeedback(true);

    const res = await checkProblems();

    setShowingFeedback(false);

    if (res.error) {
      showError(res.error);
    }
  };

  const isShowingChecking = isChecking || showingFeedback;

  return (
    <Button
      dir={dir}
      size={size}
      variant={variant}
      onClick={handleRecheck}
      disabled={isShowingChecking}
      className={className}
      data-testid="recheck-button"
    >
      <RefreshCw
        size={14}
        className={`mr-1 ${isShowingChecking ? "animate-spin" : ""}`}
      />
      {isShowingChecking ? t("Checking...") : t("Run checks")}
    </Button>
  );
};

interface ProblemsSummaryProps {
  problemReport: ProblemReport;
  appId: string;
}

const ProblemsSummary = ({ problemReport, appId }: ProblemsSummaryProps) => {
  const { t, dir } = useI18n();
  const { streamMessage } = useStreamChat();
  const { problems } = problemReport;
  const totalErrors = problems.length;
  const [selectedChatId] = useAtom(selectedChatIdAtom);

  const handleFixAll = () => {
    if (!selectedChatId) {
      return;
    }
    streamMessage({
      prompt: createProblemFixPrompt(problemReport),
      chatId: selectedChatId,
    });
  };

  if (problems.length === 0) {
    return (
      <div
        dir={dir}
        className="flex flex-col items-center justify-center h-32 text-center"
      >
        <p dir={dir} className="mt-6 text-sm font-medium text-muted-foreground mb-3">
          {t("No problems found")}
        </p>
        <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center mb-3">
          <Check size={20} className="text-green-600 dark:text-green-400" />
        </div>

        <RecheckButton appId={appId} />
      </div>
    );
  }

  return (
    <div
      dir={dir}
      className="flex items-center justify-between px-4 py-3 bg-[var(--background-darkest)] border-b border-border"
    >
      <div className="flex items-center gap-4">
        {totalErrors > 0 && (
          <div className="flex items-center gap-2">
            <XCircle size={16} className="text-red-500" />
            <span dir={dir} className="text-sm font-medium">
              {t("error count", { count: totalErrors })}
            </span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <RecheckButton appId={appId} />
        <Button
          dir={dir}
          size="sm"
          variant="default"
          onClick={handleFixAll}
          className="h-7 px-3 text-xs"
          data-testid="fix-all-button"
        >
          <Wrench size={14} className="mr-1" />
          {t("Fix All")}
        </Button>
      </div>
    </div>
  );
};

export function Problems() {
  const { dir } = useI18n();
  return (
    <div dir={dir} data-testid="problems-pane">
      <_Problems />
    </div>
  );
}

export function _Problems() {
  const { t, dir } = useI18n();
  const selectedAppId = useAtomValue(selectedAppIdAtom);
  const { problemReport } = useCheckProblems(selectedAppId);

  if (!selectedAppId) {
    return (
      <div
        dir={dir}
        className="flex flex-col items-center justify-center h-full text-center p-8"
      >
        <div className="w-16 h-16 rounded-full bg-[var(--background-darkest)] flex items-center justify-center mb-4">
          <AlertTriangle size={24} className="text-muted-foreground" />
        </div>
        <h3 dir={dir} className="text-lg font-medium mb-2">
          {t("No App Selected")}
        </h3>
        <p dir={dir} className="text-sm text-muted-foreground max-w-md">
          {t("Select an app to view TypeScript problems and diagnostic information.")}
        </p>
      </div>
    );
  }

  if (!problemReport) {
    return (
      <div
        dir={dir}
        className="flex flex-col items-center justify-center h-full text-center p-8"
      >
        <div className="w-16 h-16 rounded-full bg-[var(--background-darkest)] flex items-center justify-center mb-4">
          <AlertTriangle size={24} className="text-muted-foreground" />
        </div>
        <h3 dir={dir} className="text-lg font-medium mb-2">
          {t("No Problems Report")}
        </h3>
        <p dir={dir} className="text-sm text-muted-foreground max-w-md mb-4">
          {t("Run checks to scan your app for TypeScript errors and other problems.")}
        </p>
        <RecheckButton appId={selectedAppId} />
      </div>
    );
  }

  return (
    <div dir={dir} className="flex flex-col h-full">
      <ProblemsSummary problemReport={problemReport} appId={selectedAppId} />
      <div className="flex-1 overflow-y-auto">
        {problemReport.problems.map((problem, index) => (
          <ProblemItem
            key={`${problem.file}-${problem.line}-${problem.column}-${index}`}
            problem={problem}
          />
        ))}
      </div>
    </div>
  );
}
