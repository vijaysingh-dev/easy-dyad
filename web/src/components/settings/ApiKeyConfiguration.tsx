import { Info, KeyRound, Trash2, Clipboard } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { AzureConfiguration } from "./AzureConfiguration";
import { VertexConfiguration } from "./VertexConfiguration";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { UserSettings } from "@/shared/schemas";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { showError } from "@/components/Toast";
import { useI18n } from "@/lib/i18n";

interface ApiKeyConfigurationProps {
  provider: string;
  providerDisplayName: string;
  settings: UserSettings | null | undefined;
  envVars: Record<string, string | undefined>;
  envVarName?: string;
  isSaving: boolean;
  saveError: string | null;
  apiKeyInput: string;
  onApiKeyInputChange: (value: string) => void;
  onSaveKey: (value: string) => Promise<void>;
  onDeleteKey: () => Promise<void>;
  isEezi: boolean;
  updateSettings: (settings: Partial<UserSettings>) => Promise<UserSettings>;
}

export function ApiKeyConfiguration({
  provider,
  providerDisplayName,
  settings,
  envVars,
  envVarName,
  isSaving,
  saveError,
  apiKeyInput,
  onApiKeyInputChange,
  onSaveKey,
  onDeleteKey,
  isEezi,
  updateSettings,
}: ApiKeyConfigurationProps) {
  const { t, dir } = useI18n();
  // Special handling for Azure OpenAI which requires environment variables
  if (provider === "azure") {
    return (
      <AzureConfiguration
        settings={settings}
        envVars={envVars}
        updateSettings={updateSettings}
      />
    );
  }
  // Special handling for Google Vertex AI which uses service account credentials
  if (provider === "vertex") {
    return <VertexConfiguration />;
  }

  const envApiKey = envVarName ? envVars[envVarName] : undefined;
  const userApiKey = settings?.providerSettings?.[provider]?.apiKey?.value;

  const isValidUserKey =
    !!userApiKey && !userApiKey.startsWith("Invalid Key") && userApiKey !== "Not Set";
  const hasEnvKey = !!envApiKey;

  const activeKeySource = isValidUserKey ? "settings" : hasEnvKey ? "env" : "none";

  const defaultAccordionValue = [];
  if (isValidUserKey || !hasEnvKey) {
    defaultAccordionValue.push("settings-key");
  }
  if (!isEezi && hasEnvKey) {
    defaultAccordionValue.push("env-key");
  }

  // Helper function to mask ENV API keys (move or duplicate if needed elsewhere)
  const maskEnvApiKey = (key: string | undefined): string => {
    if (!key) return t("Not Set");
    if (key.length < 8) return "****";
    return `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
  };

  return (
    <Accordion
      type="multiple"
      className="w-full space-y-4"
      defaultValue={defaultAccordionValue}
    >
      <AccordionItem
        value="settings-key"
        className="border rounded-lg px-4 bg-(--background-lightest)"
      >
        <AccordionTrigger
          dir={dir}
          className="text-lg font-medium hover:no-underline cursor-pointer"
        >
          {t("API Key from Settings")}
        </AccordionTrigger>
        <AccordionContent className="pt-4 ">
          {isValidUserKey && (
            <Alert variant="default" className="mb-4">
              <KeyRound className="h-4 w-4" />
              <AlertTitle className="flex justify-between items-center">
                <span dir={dir}>{t("Current Key (Settings)")}</span>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={onDeleteKey}
                  disabled={isSaving}
                  className="flex items-center gap-1 h-7 px-2"
                >
                  <Trash2 className="h-4 w-4" />
                  {isSaving ? t("Deleting...") : t("Delete")}
                </Button>
              </AlertTitle>
              <AlertDescription>
                <p dir={dir} className="font-mono text-sm">
                  {userApiKey}
                </p>
                {activeKeySource === "settings" && (
                  <p
                    dir={dir}
                    className="text-xs text-green-600 dark:text-green-400 mt-1"
                  >
                    {t("This key is currently active.")}
                  </p>
                )}
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <label
              dir={dir}
              htmlFor="apiKeyInput"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              {isValidUserKey ? t("Update") : t("Set")} {providerDisplayName}{" "}
              {t("API Key")}
            </label>
            <div className="flex items-start space-x-2">
              <Input
                id="apiKeyInput"
                value={apiKeyInput}
                onChange={(e) => onApiKeyInputChange(e.target.value)}
                placeholder={t("Enter new provider API Key here", {
                  provider: providerDisplayName,
                })}
                className={`flex-grow ${saveError ? "border-red-500" : ""}`}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={async () => {
                      try {
                        const text = await navigator.clipboard.readText();
                        if (text) {
                          onSaveKey(text);
                        }
                      } catch (error) {
                        showError(t("Failed to paste from clipboard"));
                        console.error("Failed to paste from clipboard", error);
                      }
                    }}
                    disabled={isSaving}
                    variant="outline"
                    size="icon"
                    title={t("Paste from clipboard and save")}
                    aria-label={t("Paste from clipboard and save")}
                  >
                    <Clipboard className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent dir={dir}>
                  {t("Paste from clipboard and save")}
                </TooltipContent>
              </Tooltip>

              <Button
                onClick={() => onSaveKey(apiKeyInput)}
                disabled={isSaving || !apiKeyInput}
              >
                {isSaving ? t("Saving...") : t("Save Key")}
              </Button>
            </div>
            {saveError && (
              <p dir={dir} className="text-xs text-red-600">
                {saveError}
              </p>
            )}
            <p dir={dir} className="text-xs text-gray-500 dark:text-gray-400">
              {t("Setting a key here will override the environment variable (if set).")}
            </p>
          </div>
        </AccordionContent>
      </AccordionItem>

      {!isEezi && envVarName && (
        <AccordionItem
          value="env-key"
          className="border rounded-lg px-4 bg-(--background-lightest)"
        >
          <AccordionTrigger
            dir={dir}
            className="text-lg font-medium hover:no-underline cursor-pointer"
          >
            {t("API Key from Environment Variable")}
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            {hasEnvKey ? (
              <Alert variant="default">
                <KeyRound className="h-4 w-4" />
                <AlertTitle dir={dir}>{t("envvar_key", { envVarName })}</AlertTitle>
                <AlertDescription>
                  <p dir={dir} className="font-mono text-sm">
                    {maskEnvApiKey(envApiKey)}
                  </p>
                  {activeKeySource === "env" && (
                    <p
                      dir={dir}
                      className="text-xs text-green-600 dark:text-green-400 mt-1"
                    >
                      {t("This key is currently active (no settings key set).")}
                    </p>
                  )}
                  {activeKeySource === "settings" && (
                    <p
                      dir={dir}
                      className="text-xs text-yellow-600 dark:text-yellow-400 mt-1"
                    >
                      {t(
                        "This key is currently being overridden by the key set in Settings."
                      )}
                    </p>
                  )}
                </AlertDescription>
              </Alert>
            ) : (
              <Alert variant="default">
                <Info className="h-4 w-4" />
                <AlertTitle dir={dir}>{t("Environment Variable Not Set")}</AlertTitle>
                <AlertDescription dir={dir}>
                  {t("The ")}
                  <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded text-xs">
                    {t("provided_value", { value: envVarName })}
                  </code>
                  {t(" environment variable is not set.")}
                </AlertDescription>
              </Alert>
            )}
            <p dir={dir} className="text-xs text-gray-500 dark:text-gray-400 mt-3">
              {t(
                "This key is set outside the application. If present, it will be used only if no key is configured in the Settings section above. Requires app restart to detect changes."
              )}
            </p>
          </AccordionContent>
        </AccordionItem>
      )}
    </Accordion>
  );
}
