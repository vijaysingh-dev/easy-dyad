import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/hooks/useSettings";
import { showSuccess, showError } from "@/components/Toast";

export function VercelIntegration() {
  const { t, dir } = useI18n();
  const { settings, updateSettings } = useSettings();
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const handleDisconnectFromVercel = async () => {
    setIsDisconnecting(true);
    try {
      const result = await updateSettings({
        vercelAccessToken: undefined,
      });
      if (result) {
        showSuccess(t("Successfully disconnected from Vercel"));
      } else {
        showError(t("Failed to disconnect from Vercel"));
      }
    } catch (err: any) {
      showError(t(err.message || "An error occurred while disconnecting from Vercel"));
    } finally {
      setIsDisconnecting(false);
    }
  };

  const isConnected = !!settings?.vercelAccessToken;

  if (!isConnected) {
    return null;
  }

  return (
    <div className="flex items-center justify-between" dir={dir}>
      <div dir={dir}>
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300" dir={dir}>
          {t("Vercel Integration")}
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1" dir={dir}>
          {t("Your account is connected to Vercel.")}
        </p>
      </div>

      <Button
        onClick={handleDisconnectFromVercel}
        variant="destructive"
        size="sm"
        disabled={isDisconnecting}
        className="flex items-center gap-2"
        dir={dir}
      >
        {isDisconnecting ? t("Disconnecting...") : t("Disconnect from Vercel")}
        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M24 22.525H0l12-21.05 12 21.05z" />
        </svg>
      </Button>
    </div>
  );
}
