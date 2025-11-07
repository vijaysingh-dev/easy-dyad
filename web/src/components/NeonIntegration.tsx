import { useSettings } from "@/hooks/useSettings";
import { NeonDisconnectButton } from "@/components/NeonDisconnectButton";
import { useI18n } from "@/lib/i18n";

export function NeonIntegration() {
  const { t, dir } = useI18n();
  const { settings } = useSettings();

  const isConnected = !!settings?.neon?.accessToken;

  if (!isConnected) {
    return null;
  }

  return (
    <div dir={dir} className="flex items-center justify-between">
      <div>
        <h3 dir={dir} className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {t("Neon Integration")}
        </h3>
        <p dir={dir} className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {t("Your account is connected to Neon.")}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <NeonDisconnectButton />
      </div>
    </div>
  );
}
