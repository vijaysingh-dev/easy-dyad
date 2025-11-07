import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
// We might need a Supabase icon here, but for now, let's use a generic one or text.
// import { Supabase } from "lucide-react"; // Placeholder
import { DatabaseZap } from "lucide-react"; // Using DatabaseZap as a placeholder
import { useSettings } from "@/hooks/useSettings";
import { showSuccess, showError } from "@/components/Toast";

export function SupabaseIntegration() {
  const { t, dir } = useI18n();
  const { settings, updateSettings } = useSettings();
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const handleDisconnectFromSupabase = async () => {
    setIsDisconnecting(true);
    try {
      // Clear the entire supabase object in settings
      const result = await updateSettings({
        supabase: undefined,
        // Also disable the migration setting on disconnect
        enableSupabaseWriteSqlMigration: false,
      });
      if (result) {
        showSuccess("Successfully disconnected from Supabase");
      } else {
        showError("Failed to disconnect from Supabase");
      }
    } catch (err: any) {
      showError(err.message || "An error occurred while disconnecting from Supabase");
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleMigrationSettingChange = async (enabled: boolean) => {
    try {
      await updateSettings({
        enableSupabaseWriteSqlMigration: enabled,
      });
      showSuccess("Setting updated");
    } catch (err: any) {
      showError(err.message || "Failed to update setting");
    }
  };

  // Check if there's any Supabase accessToken to determine connection status
  const isConnected = !!settings?.supabase?.accessToken;

  if (!isConnected) {
    return null;
  }

  return (
    <div dir={dir}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300" dir={dir}>
            {t("Supabase Integration")}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1" dir={dir}>
            {t("Your account is connected to Supabase.")}
          </p>
        </div>
        <Button
          onClick={handleDisconnectFromSupabase}
          variant="destructive"
          size="sm"
          disabled={isDisconnecting}
          className="flex items-center gap-2"
          dir={dir}
        >
          {isDisconnecting ? t("Disconnecting...") : t("Disconnect from Supabase")}
          <DatabaseZap className="h-4 w-4" />
        </Button>
      </div>
      <div className="mt-4">
        <div className="flex items-center space-x-3">
          <Switch
            id="supabase-migrations"
            checked={!!settings?.enableSupabaseWriteSqlMigration}
            onCheckedChange={handleMigrationSettingChange}
          />
          <div className="space-y-1">
            <Label
              htmlFor="supabase-migrations"
              className="text-sm font-medium"
              dir={dir}
            >
              {t("Write SQL migration files")}
            </Label>
            <p className="text-xs text-gray-500 dark:text-gray-400" dir={dir}>
              {t(
                "Generate SQL migration files when modifying your Supabase schema. This helps you track database changes in version control, though these files aren't used for chat context, which uses the live schema."
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
