import { useSettings } from "@/hooks/useSettings";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/lib/i18n";

export function TelemetrySwitch() {
  const { t, dir } = useI18n();
  const { settings, updateSettings } = useSettings();
  return (
    <div className="flex items-center space-x-2" dir={dir}>
      <Switch
        id="telemetry-switch"
        checked={settings?.telemetryConsent === "opted_in"}
        onCheckedChange={() => {
          updateSettings({
            telemetryConsent:
              settings?.telemetryConsent === "opted_in" ? "opted_out" : "opted_in",
          });
        }}
      />
      <Label htmlFor="telemetry-switch" dir={dir}>
        {t("Telemetry")}
      </Label>
    </div>
  );
}
