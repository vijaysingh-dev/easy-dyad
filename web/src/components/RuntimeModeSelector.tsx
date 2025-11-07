import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/lib/i18n";
import { useSettings } from "@/hooks/useSettings";
import { showError } from "@/components/Toast";
import api from "@/api";

export function RuntimeModeSelector() {
  const { t, dir } = useI18n();
  const { settings, updateSettings } = useSettings();

  if (!settings) {
    return null;
  }

  const isDockerMode = settings?.runtimeMode2 === "docker";

  const handleRuntimeModeChange = async (value: "host" | "docker") => {
    try {
      await updateSettings({ runtimeMode2: value });
    } catch (error: any) {
      showError(`Failed to update runtime mode: ${error.message}`);
    }
  };

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <div className="flex items-center space-x-2">
          <Label dir={dir} className="text-sm font-medium" htmlFor="runtime-mode">
            {t("Runtime Mode")}
          </Label>
          <Select
            value={settings.runtimeMode2 ?? "host"}
            onValueChange={handleRuntimeModeChange}
          >
            <SelectTrigger className="w-48" id="runtime-mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem dir={dir} value="host">
                {t("Local (default)")}
              </SelectItem>
              <SelectItem dir={dir} value="docker">
                {t("Docker (experimental)")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          <span dir={dir}>
            {t(
              "Choose whether to run apps directly on the local machine or in Docker containers"
            )}
          </span>
        </div>
      </div>
      {isDockerMode && (
        <div
          dir={dir}
          className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2 rounded"
        >
          <span role="img" aria-label="warning">
            ⚠️
          </span>{" "}
          {t("Docker mode is")} <b>{t("experimental")}</b> {t("and requires")}{" "}
          <button
            type="button"
            className="underline font-medium cursor-pointer"
            onClick={() =>
              api.app.openExternalUrl("https://www.docker.com/products/docker-desktop/")
            }
          >
            {t("Docker Desktop")}
          </button>{" "}
          {t("to be installed and running")}
        </div>
      )}
    </div>
  );
}
