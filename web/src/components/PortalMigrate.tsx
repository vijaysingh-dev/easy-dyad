import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, Database, Loader2 } from "lucide-react";
import { showSuccess, showError } from "@/components/Toast";
import { useVersions } from "@/hooks/useVersions";
import api from "@/api";

interface PortalMigrateProps {
  appId: string;
}

export const PortalMigrate = ({ appId }: PortalMigrateProps) => {
  const { t, dir } = useI18n();
  const [output, setOutput] = useState<string>("");
  const { refreshVersions } = useVersions(appId);

  const migrateMutation = useMutation({
    mutationFn: async () => {
      return api.app.portalMigrateCreate({ appId });
    },
    onSuccess: (result) => {
      setOutput(result.output);
      showSuccess(t("Database migration file generated and committed successfully!"));
      refreshVersions();
    },
    onError: (error) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setOutput(`${t("Error:")} ${errorMessage}`);
      showError(errorMessage);
    },
  });

  const handleCreateMigration = () => {
    setOutput(""); // Clear previous output
    migrateMutation.mutate();
  };

  const openDocs = () => {
    api.app.openExternalUrl(
      "https://www.dyad.sh/docs/templates/portal#create-a-database-migration",
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle dir={dir} className="flex items-center gap-2">
          <Database className="w-5 h-5 text-primary" />
          {t("Portal Database Migration")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p dir={dir} className="text-sm text-gray-600 dark:text-gray-400">
          {t("Generate a new database migration file for your Portal app.")}
        </p>

        <div className="flex items-center gap-3">
          <Button
            dir={dir}
            onClick={handleCreateMigration}
            disabled={migrateMutation.isPending}
            // className="bg-primary hover:bg-purple-700 text-white"
          >
            {migrateMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t("Generating...")}
              </>
            ) : (
              <>
                <Database className="w-4 h-4 mr-2" />
                {t("Generate database migration")}
              </>
            )}
          </Button>

          <Button
            dir={dir}
            variant="outline"
            size="sm"
            onClick={openDocs}
            className="text-sm"
          >
            <ExternalLink className="w-3 h-3 mr-1" />
            {t("Docs")}
          </Button>
        </div>

        {output && (
          <div className="mt-4">
            <div className="bg-gray-50 dark:bg-gray-900 border rounded-lg p-3">
              <h4
                dir={dir}
                className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                {t("Command Output:")}
              </h4>
              <div className="max-h-64 overflow-auto">
                <pre
                  dir={dir}
                  className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap font-mono"
                >
                  {output}
                </pre>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
