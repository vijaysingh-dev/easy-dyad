import { useI18n } from "@/lib/i18n";
import React from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { useAtomValue } from "jotai";
import { showError } from "@/components/Toast";
import { useLoadApp } from "@/hooks/useLoadApp";

interface EeziAddIntegrationProps {
  node: {
    properties: {
      provider: string;
    };
  };
  children: React.ReactNode;
}

export const EeziAddIntegration: React.FC<EeziAddIntegrationProps> = ({
  node,
  children,
}) => {
  const { t, dir } = useI18n();
  const navigate = useNavigate();

  const { provider } = node.properties;
  const appId = useAtomValue(selectedAppIdAtom);
  const { app } = useLoadApp(appId);

  const handleSetupClick = () => {
    if (!appId) {
      showError(t("No app ID found"));
      return;
    }
    navigate({ to: "/app-details", search: { appId } });
  };

  if (app?.supabaseProjectName) {
    return (
      <div
        className="flex flex-col  my-2 p-3 border border-green-300 rounded-lg bg-green-50 shadow-sm"
        dir={dir}
      >
        <div className="flex items-center space-x-2">
          <svg
            className="w-5 h-5 text-green-600"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="2"
              fill="#bbf7d0"
            />
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
          </svg>
          <span className="font-semibold text-green-800">
            {t("Supabase integration complete")}
          </span>
        </div>
        <div className="text-sm text-green-900">
          <p dir={dir}>
            {t("This app is connected to Supabase project:")}{" "}
            <span className="font-mono font-medium bg-green-100 px-1 py-0.5 rounded">
              {app.supabaseProjectName}
            </span>
          </p>
          <p dir={dir}>{t('Click the chat suggestion "Keep going" to continue.')}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-2 my-2 p-3 border rounded-md bg-secondary/10"
      dir={dir}
    >
      <div className="text-sm">
        <div className="font-medium" dir={dir}>
          {t("Integrate with provider?", { provider })}
        </div>
        <div className="text-muted-foreground text-xs" dir={dir}>
          {children}
        </div>
      </div>
      <Button onClick={handleSetupClick} className="self-start w-full" dir={dir}>
        {t("Set up provider", { provider })}
      </Button>
    </div>
  );
};
