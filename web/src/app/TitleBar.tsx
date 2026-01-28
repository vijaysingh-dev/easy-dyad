import { useAtom } from "jotai";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { useLoadApps } from "@/hooks/useLoadApps";
import { useRouter, useLocation } from "@tanstack/react-router";
import { useSettings } from "@/hooks/useSettings";
import { Button } from "@/components/ui/button";
// @ts-ignore
import logoDark from "../../assets/icon/easy-dyad-dark.png";
import logoLight from "../../assets/icon/easy-dyad.png";
import { providerSettingsRoute } from "@/routes/settings/providers/$provider";
import { cn } from "@/lib/utils";
import { useDeepLink } from "@/contexts/DeepLinkContext";
import { useEffect, useState } from "react";
import { EasyProSuccessDialog } from "@/components/EasyProSuccessDialog";
import { useUserBudgetInfo } from "@/hooks/useUserBudgetInfo";
import { UserBudgetInfo } from "@/shared/easyTypes";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ActionHeader } from "@/components/preview_panel/ActionHeader";
import { useTheme } from "@/contexts/ThemeContext";
import i18n, { useI18n } from "@/lib/i18n";
import { toArabicDigits } from "@/lib/utils";

const displayCount = (count: number) =>
  i18n.language === "ar" ? toArabicDigits(count) : count.toString();

export const TitleBar = () => {
  const { t, dir } = useI18n();
  const { isDarkMode } = useTheme();
  const { apps } = useLoadApps();
  const { navigate } = useRouter();
  const location = useLocation();
  const { settings, refreshSettings } = useSettings();
  const [selectedAppId] = useAtom(selectedAppIdAtom);
  const [isSuccessDialogOpen, setIsSuccessDialogOpen] = useState(false);

  const showEasyProSuccessDialog = () => {
    setIsSuccessDialogOpen(true);
  };

  const { lastDeepLink } = useDeepLink();
  useEffect(() => {
    const handleDeepLink = async () => {
      if (lastDeepLink?.type === "easy-pro-return") {
        await refreshSettings();
        showEasyProSuccessDialog();
      }
    };
    handleDeepLink();
  }, [lastDeepLink]);

  // Get selected app name
  const selectedApp = apps.find((app) => app.id === selectedAppId);
  const displayText = selectedApp
    ? t("app_selected", { appName: selectedApp.name })
    : t("(no app selected)");

  const handleAppClick = () => {
    if (selectedApp) {
      navigate({ to: "/app-details", search: { appId: selectedApp.id } });
    }
  };

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language === "en" ? "ar" : "en");
  };

  const isEasyPro = !!settings?.providerSettings?.auto?.apiKey?.value;
  const isEasyProEnabled = Boolean(settings?.enableEasyPro);

  return (
    <>
      <div className="@container z-11 w-full h-11 bg-(--sidebar) absolute top-0 left-0 app-region-drag flex items-center justify-between">
        <div className="flex items-center">
          <img
            src={isDarkMode ? logoLight : logoDark}
            alt="Easy Dyad Logo"
            className="h-5 w-auto m-5"
          />
          <Button
            dir={dir}
            data-testid="title-bar-app-name-button"
            variant="outline"
            size="sm"
            className={`hidden @2xl:block no-app-region-drag text-xs max-w-38 truncate font-medium ${
              selectedApp ? "cursor-pointer" : ""
            }`}
            onClick={handleAppClick}
          >
            {displayText}
          </Button>
          {isEasyPro && <EasyProButton isEasyProEnabled={isEasyProEnabled} />}
        </div>
        <div className="flex items-center">
          {/* Preview Header */}
          {location.pathname === "/chat" && (
            <div className="flex-1 flex justify-end">
              <ActionHeader />
            </div>
          )}
          <button onClick={toggleLanguage} className="mr-5 flex transition-all">
            {i18n.language === "en" ? "AR" : "EN"}
          </button>
        </div>
      </div>

      <EasyProSuccessDialog
        isOpen={isSuccessDialogOpen}
        onClose={() => setIsSuccessDialogOpen(false)}
      />
    </>
  );
};

export function EasyProButton({ isEasyProEnabled }: { isEasyProEnabled: boolean }) {
  const { t, dir } = useI18n();
  const { navigate } = useRouter();
  const { userBudget } = useUserBudgetInfo();
  return (
    <Button
      dir={dir}
      data-testid="title-bar-easy-pro-button"
      onClick={() => {
        navigate({
          to: providerSettingsRoute.id,
          params: { provider: "auto" },
        });
      }}
      variant="outline"
      className={cn(
        "hidden @2xl:block ml-1 no-app-region-drag h-7 bg-indigo-600 text-white dark:bg-indigo-600 dark:text-white text-xs px-2 pt-1 pb-1",
        !isEasyProEnabled && "bg-zinc-600 dark:bg-zinc-600"
      )}
      size="sm"
    >
      {isEasyProEnabled ? t("Pro") : t("Pro (off)")}
      {userBudget && isEasyProEnabled && <AICreditStatus userBudget={userBudget} />}
    </Button>
  );
}

export function AICreditStatus({ userBudget }: { userBudget: UserBudgetInfo }) {
  const { t, dir } = useI18n();
  const remaining = Math.round(userBudget.totalCredits - userBudget.usedCredits);

  return (
    <Tooltip>
      <TooltipTrigger>
        <div dir={dir} className="text-xs pl-1 mt-0.5">
          {t("count_credits", { count: remaining }).replace(
            remaining.toString(),
            displayCount(remaining)
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <div dir={dir}>
          {t("Note: there is a slight delay in updating the credit status.")}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
