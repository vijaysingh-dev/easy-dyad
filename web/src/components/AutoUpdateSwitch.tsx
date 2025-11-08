import { useSettings } from "@/hooks/useSettings";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import api from "@/api";
import { useI18n } from "@/lib/i18n";

export function AutoUpdateSwitch() {
  const { settings, updateSettings } = useSettings();
  const { t, dir } = useI18n();

  if (!settings) {
    return null;
  }

  return (
    <div
      className={`flex items-center gap-x-2 ${dir === "rtl" ? "flex-row-reverse" : ""}`}
    >
      <Switch
        id="enable-auto-update"
        checked={settings.enableAutoUpdate}
        onCheckedChange={(checked) => {
          updateSettings({ enableAutoUpdate: checked });
          toast(t("Auto-update settings changed"), {
            description: t(
              "You will need to restart Eezi for your settings to take effect."
            ),
            action: {
              label: t("Restart Eezi"),
              onClick: () => {
                api.app.restartEezi();
              },
            },
          });
        }}
      />
      <Label htmlFor="enable-auto-update">{t("Auto-update")}</Label>
    </div>
  );
}
