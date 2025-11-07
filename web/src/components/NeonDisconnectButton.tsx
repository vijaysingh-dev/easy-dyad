import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useSettings } from "@/hooks/useSettings";
import { useI18n } from "@/lib/i18n";

interface NeonDisconnectButtonProps {
  className?: string;
}

export function NeonDisconnectButton({ className }: NeonDisconnectButtonProps) {
  const { t, dir } = useI18n();
  const { updateSettings, settings } = useSettings();

  const handleDisconnect = async () => {
    try {
      await updateSettings({
        neon: undefined,
      });
      toast.success(t("Disconnected from Neon successfully"));
    } catch (error) {
      console.error("Failed to disconnect from Neon:", error);
      toast.error(t("Failed to disconnect from Neon"));
    }
  };

  if (!settings?.neon?.accessToken) {
    return null;
  }

  return (
    <Button
      dir={dir}
      variant="destructive"
      onClick={handleDisconnect}
      className={className}
      size="sm"
    >
      {t("Disconnect from Neon")}
    </Button>
  );
}
