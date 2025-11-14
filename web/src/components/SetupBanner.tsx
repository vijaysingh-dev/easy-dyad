import { useI18n } from "@/lib/i18n";
import { useNavigate } from "@tanstack/react-router";
import {
  ChevronRight,
  GiftIcon,
  Sparkles,
  CheckCircle,
  AlertCircle,
  XCircle,
  Loader2,
  Settings,
  GlobeIcon,
} from "lucide-react";
import { providerSettingsRoute } from "@/routes/settings/providers/$provider";

import SetupProviderCard from "@/components/SetupProviderCard";

import { useState, useEffect, useCallback } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NodeSystemInfo } from "@/shared/eeziTypes";
import { usePostHog } from "posthog-js/react";
import { useLanguageModelProviders } from "@/hooks/useLanguageModelProviders";
import { useScrollAndNavigateTo } from "@/hooks/useScrollAndNavigateTo";
// @ts-ignore
import logo from "../../assets/icon/eezi.png";
import { OnboardingBanner } from "./home/OnboardingBanner";
import api from "@/api";

type NodeInstallStep =
  | "install"
  | "waiting-for-continue"
  | "continue-processing"
  | "finished-checking";

export function SetupBanner() {
  const { t, dir } = useI18n();
  const posthog = usePostHog();
  const navigate = useNavigate();
  const [isOnboardingVisible, setIsOnboardingVisible] = useState(true);
  const { isAnyProviderSetup, isLoading: loading } = useLanguageModelProviders();
  const [nodeSystemInfo, setNodeSystemInfo] = useState<NodeSystemInfo | null>(null);
  const [nodeCheckError, setNodeCheckError] = useState<boolean>(false);
  const [nodeInstallStep, setNodeInstallStep] = useState<NodeInstallStep>("install");
  const checkNode = useCallback(async () => {
    try {
      setNodeCheckError(false);
      const status = await api.settings.getNodejsStatus();
      setNodeSystemInfo(status);
    } catch (error) {
      console.error("Failed to check Node.js status:", error);
      setNodeSystemInfo(null);
      setNodeCheckError(true);
    }
  }, [setNodeSystemInfo, setNodeCheckError]);

  useEffect(() => {
    checkNode();
  }, [checkNode]);

  const settingsScrollAndNavigateTo = useScrollAndNavigateTo("/settings", {
    behavior: "smooth",
    block: "start",
  });

  const handleGoogleSetupClick = () => {
    posthog.capture("setup-flow:ai-provider-setup:google:click");
    navigate({
      to: providerSettingsRoute.id,
      params: { provider: "google" },
    });
  };

  const handleOpenRouterSetupClick = () => {
    posthog.capture("setup-flow:ai-provider-setup:openrouter:click");
    navigate({
      to: providerSettingsRoute.id,
      params: { provider: "openrouter" },
    });
  };
  const handleEeziProSetupClick = () => {
    posthog.capture("setup-flow:ai-provider-setup:eezi:click");
    api.app.openExternalUrl(
      "https://www.dyad.sh/pro?utm_source=eezi-app&utm_medium=app&utm_campaign=setup-banner"
    );
  };

  const handleOtherProvidersClick = () => {
    posthog.capture("setup-flow:ai-provider-setup:other:click");
    settingsScrollAndNavigateTo("provider-settings");
  };

  const handleNodeInstallClick = useCallback(async () => {
    posthog.capture("setup-flow:start-node-install-click");
    setNodeInstallStep("waiting-for-continue");
    api.app.openExternalUrl(nodeSystemInfo!.nodeDownloadUrl);
  }, [nodeSystemInfo, setNodeInstallStep]);

  const finishNodeInstall = useCallback(async () => {
    posthog.capture("setup-flow:continue-node-install-click");
    setNodeInstallStep("continue-processing");
    // await api.app.reloadEnvPath();
    await checkNode();
    setNodeInstallStep("finished-checking");
  }, [checkNode, setNodeInstallStep]);

  // We only check for node version because pnpm is not required for the app to run.
  const isNodeSetupComplete = Boolean(nodeSystemInfo?.nodeVersion);

  const itemsNeedAction: string[] = [];
  if (!isNodeSetupComplete && nodeSystemInfo) {
    itemsNeedAction.push("node-setup");
  }
  if (!isAnyProviderSetup() && !loading) {
    itemsNeedAction.push("ai-setup");
  }

  if (itemsNeedAction.length === 0) {
    return (
      <h1
        dir={dir}
        className="text-center text-5xl font-bold mb-8 bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-gray-100 dark:to-gray-400 tracking-tight"
      >
        {t("Build your dream app")}
      </h1>
    );
  }

  const bannerClasses = cn(
    "w-full mb-6 border rounded-xl shadow-sm overflow-hidden",
    "border-zinc-200 dark:border-zinc-700"
  );

  const getStatusIcon = (isComplete: boolean, hasError: boolean = false) => {
    if (hasError) {
      return <XCircle className="w-5 h-5 text-red-500" />;
    }
    return isComplete ? (
      <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-500" />
    ) : (
      <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-500" />
    );
  };

  return (
    <>
      <p dir={dir} className="text-xl font-medium text-zinc-700 dark:text-zinc-300 p-4">
        {t("Setup Eezi")}
      </p>
      <OnboardingBanner
        isVisible={isOnboardingVisible}
        setIsVisible={setIsOnboardingVisible}
      />
      <div className={bannerClasses}>
        <Accordion type="multiple" className="w-full" defaultValue={itemsNeedAction}>
          <AccordionItem
            value="node-setup"
            className={cn(
              nodeCheckError
                ? "bg-red-50 dark:bg-red-900/30"
                : isNodeSetupComplete
                ? "bg-green-50 dark:bg-green-900/30"
                : "bg-yellow-50 dark:bg-yellow-900/30"
            )}
          >
            <AccordionTrigger className="px-4 py-3 transition-colors w-full hover:no-underline">
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-3">
                  {getStatusIcon(isNodeSetupComplete, nodeCheckError)}
                  <span dir={dir} className="font-medium text-sm">
                    {t("1. Install Node.js (App Runtime)")}
                  </span>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pt-2 pb-4 bg-white dark:bg-zinc-900 border-t border-inherit">
              {nodeCheckError && (
                <p dir={dir} className="text-sm text-red-600 dark:text-red-400">
                  {t("Error checking Node.js status. Try installing Node.js.")}
                </p>
              )}
              {isNodeSetupComplete ? (
                <p dir={dir} className="text-sm">
                  {t("Node.js version installed", {
                    version: nodeSystemInfo!.nodeVersion,
                  })}
                  {nodeSystemInfo!.pnpmVersion && (
                    <span dir={dir} className="text-xs text-gray-500">
                      {t("(optional) pnpm version installed", {
                        version: nodeSystemInfo!.pnpmVersion,
                      })}
                    </span>
                  )}
                </p>
              ) : (
                <div className="text-sm">
                  <p dir={dir}>{t("Node.js is required to run apps locally.")}</p>
                  {nodeInstallStep === "waiting-for-continue" && (
                    <p dir={dir} className="mt-1">
                      {t(
                        'After you have installed Node.js, click "Continue". If the installer didn\'t work, try more download options.',
                        {
                          more: (
                            <a
                              className="text-blue-500 dark:text-blue-400 hover:underline"
                              onClick={() => {
                                api.app.openExternalUrl(
                                  "https://nodejs.org/en/download"
                                );
                              }}
                            >
                              {t("more download options")}
                            </a>
                          ),
                        }
                      )}
                    </p>
                  )}
                  <NodeInstallButton
                    nodeInstallStep={nodeInstallStep}
                    handleNodeInstallClick={handleNodeInstallClick}
                    finishNodeInstall={finishNodeInstall}
                  />
                </div>
              )}
              <NodeJsHelpCallout />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem
            value="ai-setup"
            className={cn(
              isAnyProviderSetup()
                ? "bg-green-50 dark:bg-green-900/30"
                : "bg-yellow-50 dark:bg-yellow-900/30"
            )}
          >
            <AccordionTrigger
              className={cn("px-4 py-3 transition-colors w-full hover:no-underline")}
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-3">
                  {getStatusIcon(isAnyProviderSetup())}
                  <span className="font-medium text-sm">
                    {t("2. Setup AI Model Access")}
                  </span>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pt-2 pb-4 bg-white dark:bg-zinc-900 border-t border-inherit">
              <p dir={dir} className="text-sm mb-3">
                {t("Connect your preferred AI provider to start generating code.")}
              </p>
              <SetupProviderCard
                variant="google"
                onClick={handleGoogleSetupClick}
                tabIndex={isNodeSetupComplete ? 0 : -1}
                leadingIcon={
                  <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                }
                title={t("Setup Google Gemini API Key")}
                subtitle={
                  <>
                    <GiftIcon className="w-3 h-3" />
                    {t("Use Google Gemini for free")}
                  </>
                }
              />

              <SetupProviderCard
                className="mt-2"
                variant="openrouter"
                onClick={handleOpenRouterSetupClick}
                tabIndex={isNodeSetupComplete ? 0 : -1}
                leadingIcon={
                  <Sparkles className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                }
                title={t("Setup OpenRouter API Key")}
                subtitle={
                  <>
                    <GiftIcon className="w-3 h-3" />
                    {t("Free models available")}
                  </>
                }
              />

              <SetupProviderCard
                className="mt-2"
                variant="eezi"
                onClick={handleEeziProSetupClick}
                tabIndex={isNodeSetupComplete ? 0 : -1}
                leadingIcon={
                  <img src={logo} alt="Eezi Logo" className="w-6 h-6 mr-0.5" />
                }
                title={t("Setup Eezi Pro")}
                subtitle={
                  <>
                    <GlobeIcon className="w-3 h-3" />
                    {t("Access all AI models with one plan")}
                  </>
                }
              />

              <div
                dir={dir}
                className="mt-2 p-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800/70 transition-colors"
                onClick={handleOtherProvidersClick}
                role="button"
                tabIndex={isNodeSetupComplete ? 0 : -1}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="bg-gray-100 dark:bg-gray-700 p-1.5 rounded-full">
                      <Settings className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                    </div>
                    <div>
                      <h4 className="font-medium text-sm text-gray-800 dark:text-gray-300">
                        {t("Setup other AI providers")}
                      </h4>
                      <p dir={dir} className="text-xs text-gray-600 dark:text-gray-400">
                        {t("OpenAI, Anthropic, OpenRouter and more")}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </>
  );
}

function NodeJsHelpCallout() {
  const { t, dir } = useI18n();
  return (
    <div
      dir={dir}
      className="mt-3 p-3 bg-(--background-lighter) border rounded-lg text-sm"
    >
      <p dir={dir}>
        {t("If you run into issues, read our troubleshooting guide", {
          guide: (
            <a
              onClick={() => {
                api.app.openExternalUrl("https://www.dyad.sh/docs/help/nodejs");
              }}
              className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
            >
              {t("Node.js troubleshooting guide")}
            </a>
          ),
        })}
      </p>
      <p dir={dir} className="mt-2">
        {t(
          "Still stuck? Click the Help button in the bottom-left corner and then Report a Bug."
        )}
      </p>
    </div>
  );
}

function NodeInstallButton({
  nodeInstallStep,
  handleNodeInstallClick,
  finishNodeInstall,
}: {
  nodeInstallStep: NodeInstallStep;
  handleNodeInstallClick: () => void;
  finishNodeInstall: () => void;
}) {
  const { t, dir } = useI18n();
  switch (nodeInstallStep) {
    case "install":
      return (
        <Button dir={dir} className="mt-3" onClick={handleNodeInstallClick}>
          {t("Install Node.js Runtime")}
        </Button>
      );
    case "continue-processing":
      return (
        <Button dir={dir} className="mt-3" onClick={finishNodeInstall} disabled>
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("Checking Node.js setup...")}
          </div>
        </Button>
      );
    case "waiting-for-continue":
      return (
        <Button dir={dir} className="mt-3" onClick={finishNodeInstall}>
          <div className="flex items-center gap-2">
            {t("Continue | I installed Node.js")}
          </div>
        </Button>
      );
    case "finished-checking":
      return (
        <div dir={dir} className="mt-3 text-sm text-red-600 dark:text-red-400">
          {t("Node.js not detected. Closing and re-opening Eezi usually fixes this.")}
        </div>
      );
    default:
      const _exhaustiveCheck: never = nodeInstallStep;
  }
}

export const OpenRouterSetupBanner = ({ className }: { className?: string }) => {
  const { t, dir } = useI18n();
  const posthog = usePostHog();
  const navigate = useNavigate();
  return (
    <SetupProviderCard
      className={cn("mt-2", className)}
      variant="openrouter"
      onClick={() => {
        posthog.capture("setup-flow:ai-provider-setup:openrouter:click");
        navigate({
          to: providerSettingsRoute.id,
          params: { provider: "openrouter" },
        });
      }}
      tabIndex={0}
      leadingIcon={<Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />}
      title={t("Setup OpenRouter API Key")}
      subtitle={
        <>
          <GiftIcon className="w-3 h-3" />
          {t("Free models available")}
        </>
      }
    />
  );
};
