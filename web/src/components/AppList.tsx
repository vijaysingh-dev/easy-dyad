import { useNavigate } from "@tanstack/react-router";
import { PlusCircle, Search } from "lucide-react";
import { useAtom, useSetAtom } from "jotai";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { selectedChatIdAtom } from "@/atoms/chatAtoms";
import { useLoadApps } from "@/hooks/useLoadApps";
import { useMemo, useState } from "react";
import { AppSearchDialog } from "./AppSearchDialog";
import { useAddAppToFavorite } from "@/hooks/useAddAppToFavorite";
import { AppItem } from "./appItem";
import { useI18n } from "@/lib/i18n";

export function AppList({ show }: { show?: boolean }) {
  const { t, dir } = useI18n();
  const navigate = useNavigate();
  const [selectedAppId, setSelectedAppId] = useAtom(selectedAppIdAtom);
  const setSelectedChatId = useSetAtom(selectedChatIdAtom);
  const { apps, loading, error } = useLoadApps();
  const { toggleFavorite, isLoading: isFavoriteLoading } = useAddAppToFavorite();
  // search dialog state
  const [isSearchDialogOpen, setIsSearchDialogOpen] = useState(false);

  const allApps = useMemo(
    () =>
      apps.map((a) => ({
        id: a.id,
        name: a.name,
        createdAt: a.createdAt,
        matchedChatTitle: null,
        matchedChatMessage: null,
      })),
    [apps],
  );

  const favoriteApps = useMemo(() => apps.filter((app) => app.isFavorite), [apps]);

  const nonFavoriteApps = useMemo(() => apps.filter((app) => !app.isFavorite), [apps]);

  if (!show) {
    return null;
  }

  const handleAppClick = (id: string) => {
    setSelectedAppId(id);
    setSelectedChatId(null);
    setIsSearchDialogOpen(false);
    navigate({
      to: "/",
      search: { appId: id },
    });
  };

  const handleNewApp = () => {
    navigate({ to: "/hub" });
    // We'll eventually need a create app workflow
  };

  const handleToggleFavorite = (appId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFavorite(appId);
  };

  return (
    <>
      <SidebarGroup
        className="overflow-y-auto h-[calc(100vh-112px)]"
        data-testid="app-list-container"
      >
        <SidebarGroupLabel dir={dir}>{t("Your Apps")}</SidebarGroupLabel>
        <SidebarGroupContent>
          <div className="flex flex-col space-y-2">
            <Button
              dir={dir}
              onClick={handleNewApp}
              variant="outline"
              className="flex items-center justify-start gap-2 mx-2 py-2"
            >
              <PlusCircle size={16} />
              <span>{t("New App")}</span>
            </Button>
            <Button
              dir={dir}
              onClick={() => setIsSearchDialogOpen(!isSearchDialogOpen)}
              variant="outline"
              className="flex items-center justify-start gap-2 mx-2 py-3"
              data-testid="search-apps-button"
            >
              <Search size={16} />
              <span>{t("Search Apps")}</span>
            </Button>

            {loading ? (
              <div className="py-2 px-4 text-sm text-gray-500">
                {t("Loading apps...")}
              </div>
            ) : error ? (
              <div className="py-2 px-4 text-sm text-red-500">
                {t("Error loading apps")}
              </div>
            ) : apps.length === 0 ? (
              <div className="py-2 px-4 text-sm text-gray-500">{t("No apps found")}</div>
            ) : (
              <SidebarMenu className="space-y-1" data-testid="app-list">
                <SidebarGroupLabel dir={dir}>{t("Favorite apps")}</SidebarGroupLabel>
                {favoriteApps.map((app) => (
                  <AppItem
                    key={app.id}
                    app={app}
                    handleAppClick={handleAppClick}
                    selectedAppId={selectedAppId}
                    handleToggleFavorite={handleToggleFavorite}
                    isFavoriteLoading={isFavoriteLoading}
                  />
                ))}
                <SidebarGroupLabel dir={dir}>{t("Other apps")}</SidebarGroupLabel>
                {nonFavoriteApps.map((app) => (
                  <AppItem
                    key={app.id}
                    app={app}
                    handleAppClick={handleAppClick}
                    selectedAppId={selectedAppId}
                    handleToggleFavorite={handleToggleFavorite}
                    isFavoriteLoading={isFavoriteLoading}
                  />
                ))}
              </SidebarMenu>
            )}
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
      <AppSearchDialog
        open={isSearchDialogOpen}
        onOpenChange={setIsSearchDialogOpen}
        onSelectApp={handleAppClick}
        allApps={allApps}
      />
    </>
  );
}
