import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Github } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";
import { showSuccess, showError } from "@/components/Toast";

export function GitHubIntegration() {
  const { t, dir } = useI18n();
  const { settings, updateSettings } = useSettings();
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const handleDisconnectFromGithub = async () => {
    setIsDisconnecting(true);
    try {
      const result = await updateSettings({
        githubAccessToken: undefined,
      });
      if (result) {
        showSuccess(t("Successfully disconnected from GitHub"));
      } else {
        showError(t("Failed to disconnect from GitHub"));
      }
    } catch (err: any) {
      showError(err.message || t("An error occurred while disconnecting from GitHub"));
    } finally {
      setIsDisconnecting(false);
    }
  };

  const isConnected = !!settings?.githubAccessToken;

  if (!isConnected) {
    return null;
  }

  return (
    <div className="flex items-center justify-between">
      <div>
        <h3 dir={dir} className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {t("GitHub Integration")}
        </h3>
        <p dir={dir} className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {t("Your account is connected to GitHub.")}
        </p>
      </div>

      <Button
        dir={dir}
        onClick={handleDisconnectFromGithub}
        variant="destructive"
        size="sm"
        disabled={isDisconnecting}
        className="flex items-center gap-2"
      >
        {isDisconnecting ? t("Disconnecting...") : t("Disconnect from GitHub")}
        <Github className="h-4 w-4" />
      </Button>
    </div>
  );
}
