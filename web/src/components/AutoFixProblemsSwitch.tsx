import { useSettings } from "@/hooks/useSettings";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { showInfo } from "@/components/Toast";
import { useI18n } from "@/lib/i18n";

export function AutoFixProblemsSwitch({ showToast = false }: { showToast?: boolean }) {
  const { settings, updateSettings } = useSettings();
  const { t, dir } = useI18n();
  return (
    <div className="flex items-center space-x-2" dir={dir}>
      <Switch
        id="auto-fix-problems"
        checked={settings?.enableAutoFixProblems}
        onCheckedChange={() => {
          updateSettings({
            enableAutoFixProblems: !settings?.enableAutoFixProblems,
          });
          if (!settings?.enableAutoFixProblems && showToast) {
            showInfo(t("You can disable Auto-fix problems in the Settings page."));
          }
        }}
        dir={dir}
      />
      <Label htmlFor="auto-fix-problems" dir={dir}>
        {t("Auto-fix problems")}
      </Label>
    </div>
  );
}
