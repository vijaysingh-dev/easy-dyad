import { useI18n } from "@/lib/i18n";
import { useSettings } from "@/hooks/useSettings";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { ReleaseChannel } from "@/shared/schemas";
import api from "@/api";

export function ReleaseChannelSelector() {
  const { t, dir } = useI18n();
  const { settings, updateSettings } = useSettings();

  if (!settings) {
    return null;
  }

  const handleReleaseChannelChange = (value: ReleaseChannel) => {
    updateSettings({ releaseChannel: value });
    if (value === "stable") {
      toast(t("Using Stable release channel"), {
        description: t(
          "You'll stay on your current version until a newer stable release is available, or you can manually downgrade now."
        ),
        action: {
          label: t("Download Stable"),
          onClick: () => {
            api.app.openExternalUrl("https://dyad.sh/download");
          },
        },
      });
    } else {
      toast(t("Using Beta release channel"), {
        description: t(
          "You will need to restart Easy Dyad for your settings to take effect."
        ),
        action: {
          label: t("Restart Easy Dyad"),
          onClick: () => {
            api.app.restartEasyDyad();
          },
        },
      });
    }
  };

  return (
    <div dir={dir} className="gap-y-1">
      <div className="flex items-center gap-x-2">
        <label
          dir={dir}
          htmlFor="release-channel"
          className="text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          {t("Release Channel")}
        </label>
        <Select
          value={settings.releaseChannel}
          onValueChange={handleReleaseChannelChange}
        >
          <SelectTrigger className="w-32" id="release-channel">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem dir={dir} value="stable">
              {t("Stable")}
            </SelectItem>
            <SelectItem dir={dir} value="beta">
              {t("Beta")}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="text-sm text-gray-500 dark:text-gray-400">
        <p dir={dir}>{t("Stable is recommended for most users.")}</p>
        <p dir={dir}>
          {t("Beta receives more frequent updates but may have more bugs.")}
        </p>
      </div>
    </div>
  );
}
