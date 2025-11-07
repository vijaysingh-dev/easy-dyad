import { useSettings } from "@/hooks/useSettings";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { showInfo } from "@/components/Toast";
import { useI18n } from "@/lib/i18n";

export function AutoApproveSwitch({ showToast = true }: { showToast?: boolean }) {
  const { settings, updateSettings } = useSettings();
  const { t, dir } = useI18n();
  return (
    <div className="flex items-center space-x-2" dir={dir}>
      <Switch
        id="auto-approve"
        checked={settings?.autoApproveChanges}
        onCheckedChange={() => {
          updateSettings({ autoApproveChanges: !settings?.autoApproveChanges });
          if (!settings?.autoApproveChanges && showToast) {
            showInfo(t("You can disable auto-approve in the Settings."));
          }
        }}
        dir={dir}
      />
      <Label htmlFor="auto-approve" dir={dir}>
        {t("Auto-approve")}
      </Label>
    </div>
  );
}
