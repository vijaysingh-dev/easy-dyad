import { useState } from "react";
import { useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { appBasePathAtom, appsListAtom, selectedAppIdAtom } from "@/atoms/appAtoms";
import { useLoadApps } from "@/hooks/useLoadApps";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MoreVertical, MessageCircle, Pencil, Folder } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GitHubConnector } from "@/components/GitHubConnector";
import { SupabaseConnector } from "@/components/SupabaseConnector";
import { showError } from "@/components/Toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { invalidateAppQuery } from "@/hooks/useLoadApp";
import { useDebounce } from "@/hooks/useDebounce";
import { useCheckName } from "@/hooks/useCheckName";
import { AppUpgrades } from "@/components/AppUpgrades";
import { CapacitorControls } from "@/components/CapacitorControls";
import { useI18n } from "@/lib/i18n";
import api from "@/api";

export default function AppDetailsPage() {
  const { t, dir } = useI18n();
  const navigate = useNavigate();
  const router = useRouter();
  const search = useSearch({ from: "/app-details" as const });
  const [appsList] = useAtom(appsListAtom);
  const { refreshApps } = useLoadApps();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [newAppName, setNewAppName] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const appBasePath = useAtomValue(appBasePathAtom);

  const [isCopyDialogOpen, setIsCopyDialogOpen] = useState(false);
  const [newCopyAppName, setNewCopyAppName] = useState("");

  const queryClient = useQueryClient();
  const setSelectedAppId = useSetAtom(selectedAppIdAtom);

  const debouncedNewCopyAppName = useDebounce(newCopyAppName, 150);
  const { data: checkNameResult, isLoading: isCheckingName } = useCheckName(
    debouncedNewCopyAppName,
  );
  const nameExists = checkNameResult?.exists ?? false;

  // Get the appId from search params and find the corresponding app
  const appId = search.appId ? search.appId : null;
  const selectedApp = appId ? appsList.find((app) => app.id === appId) : null;
  console.log("AppId", appId, "appsList", appsList, "selectedApp", selectedApp);

  const handleDeleteApp = async () => {
    if (!appId) return;

    try {
      setIsDeleting(true);
      await api.app.deleteApp(appId);
      setIsDeleteDialogOpen(false);
      await refreshApps();
      navigate({ to: "/", search: {} });
    } catch (error) {
      setIsDeleteDialogOpen(false);
      showError(error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleOpenRenameDialog = () => {
    if (selectedApp) {
      setNewAppName(selectedApp.name);
      setIsRenameDialogOpen(true);
    }
  };

  const handleRenameApp = async () => {
    if (!appId || !selectedApp || !newAppName.trim()) return;

    try {
      setIsRenaming(true);
      await api.app.renameApp({ appId, newAppName });

      setIsRenameDialogOpen(false);
      await refreshApps();
    } catch (error) {
      console.error("Failed to rename app:", error);
      alert(
        `Error renaming app: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setIsRenaming(false);
    }
  };

  const handleAppNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewCopyAppName(e.target.value);
  };

  const handleOpenCopyDialog = () => {
    if (selectedApp) {
      setNewCopyAppName(`${selectedApp.name}-copy`);
      setIsCopyDialogOpen(true);
    }
  };

  const copyAppMutation = useMutation({
    mutationFn: async ({ withHistory }: { withHistory: boolean }) => {
      if (!appId || !newCopyAppName.trim()) {
        throw new Error("Invalid app ID or name for copying.");
      }
      return api.app.copyApp({
        appId,
        newAppName: newCopyAppName,
        withHistory,
      });
    },
    onSuccess: async (data) => {
      const appId = data.app.id;
      setSelectedAppId(appId);
      await invalidateAppQuery(queryClient, { appId });
      await refreshApps();
      await api.chat.createChat(appId);
      setIsCopyDialogOpen(false);
      navigate({ to: "/app-details", search: { appId } });
    },
    onError: (error) => {
      showError(error);
    },
  });

  if (!selectedApp) {
    return (
      <div className="relative min-h-screen p-8">
        <Button
          dir={dir}
          onClick={() => router.history.back()}
          variant="outline"
          size="sm"
          className="absolute top-4 left-4 flex items-center gap-1 bg-(--background-lightest) py-5"
        >
          <ArrowLeft className="h-3 w-4" />
          {t("Back")}
        </Button>
        <div className="flex flex-col items-center justify-center h-full">
          <h2 dir={dir} className="text-xl font-bold">
            {t("App not found")}
          </h2>
        </div>
      </div>
    );
  }

  const fullAppPath = appBasePath.replace("easy-apps", selectedApp.path);

  return (
    <div
      dir={dir}
      className="relative min-h-screen p-4 w-full"
      data-testid="app-details-page"
    >
      <Button
        dir={dir}
        onClick={() => router.history.back()}
        variant="outline"
        size="sm"
        className="absolute top-4 left-4 flex items-center gap-1 bg-(--background-lightest) py-2"
      >
        <ArrowLeft className="h-3 w-4" />
        {t("Back")}
      </Button>

      <div className="w-full max-w-2xl mx-auto mt-10 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm relative">
        <div className="flex items-center mb-3">
          <h2 dir={dir} className="text-2xl font-bold">
            {t("App name", { name: selectedApp.name })}
          </h2>
          <Button
            dir={dir}
            variant="ghost"
            size="sm"
            className="ml-1 p-0.5 h-auto"
            onClick={handleOpenRenameDialog}
            data-testid="app-details-rename-app-button"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Overflow Menu in top right */}
        <div className="absolute top-2 right-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                dir={dir}
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                data-testid="app-details-more-options-button"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-40 p-2" align="end">
              <div className="flex flex-col space-y-0.5">
                <Button
                  dir={dir}
                  onClick={handleOpenCopyDialog}
                  variant="ghost"
                  size="sm"
                  className="h-8 justify-start text-xs"
                >
                  {t("Copy app")}
                </Button>
                <Button
                  dir={dir}
                  onClick={() => setIsDeleteDialogOpen(true)}
                  variant="ghost"
                  size="sm"
                  className="h-8 justify-start text-xs"
                >
                  {t("Delete")}
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm mb-4">
          <div>
            <span
              dir={dir}
              className="block text-gray-500 dark:text-gray-400 mb-0.5 text-xs"
            >
              {t("Created")}
            </span>
            <span dir={dir}>{new Date().toLocaleString()}</span>
          </div>
          <div>
            <span
              dir={dir}
              className="block text-gray-500 dark:text-gray-400 mb-0.5 text-xs"
            >
              {t("Last Updated")}
            </span>
            <span dir={dir}>{new Date().toLocaleString()}</span>
          </div>
          <div className="col-span-2">
            <span
              dir={dir}
              className="block text-gray-500 dark:text-gray-400 mb-0.5 text-xs"
            >
              {t("Path")}
            </span>
            <div className="flex items-center gap-1">
              <span dir={dir} className="text-sm break-all">
                {fullAppPath}
              </span>
              <Button
                dir={dir}
                variant="ghost"
                size="sm"
                className="p-0.5 h-auto cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                onClick={() => {
                  api.app.showItemInFolder(fullAppPath);
                }}
                title={t("Show in folder")}
              >
                <Folder className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <Button
            dir={dir}
            onClick={() => {
              if (!appId) {
                console.error("No app id found");
                return;
              }
              navigate({ to: "/chat" });
            }}
            className="cursor-pointer w-full py-5 flex justify-center items-center gap-2"
            size="lg"
          >
            {t("Open in Chat")}
            <MessageCircle className="h-4 w-4" />
          </Button>
          <div className="border border-gray-200 rounded-md p-4">
            <GitHubConnector appId={appId} folderName={selectedApp.path} />
          </div>
          {appId && <SupabaseConnector appId={appId} />}
          {appId && <CapacitorControls appId={appId} />}
          <AppUpgrades appId={appId} />
        </div>

        {/* Rename Dialog */}
        <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
          <DialogContent className="max-w-sm p-4">
            <DialogHeader className="pb-2">
              <DialogTitle dir={dir}>{t("Rename App")}</DialogTitle>
            </DialogHeader>
            <Input
              dir={dir}
              value={newAppName}
              onChange={(e) => setNewAppName(e.target.value)}
              placeholder={t("Enter new app name")}
              className="my-2"
              autoFocus
            />
            <DialogFooter className="pt-2">
              <Button
                dir={dir}
                variant="outline"
                onClick={() => setIsRenameDialogOpen(false)}
                disabled={isRenaming}
                size="sm"
              >
                {t("Cancel")}
              </Button>
              <Button
                dir={dir}
                onClick={handleRenameApp}
                disabled={isRenaming || !newAppName.trim()}
                size="sm"
              >
                {t("Rename")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Copy App Dialog */}
        {selectedApp && (
          <Dialog open={isCopyDialogOpen} onOpenChange={setIsCopyDialogOpen}>
            <DialogContent className="max-w-md p-4">
              <DialogHeader className="pb-2">
                <DialogTitle dir={dir}>
                  {t('Copy "name"', { name: selectedApp.name })}
                </DialogTitle>
                <DialogDescription dir={dir} className="text-sm">
                  <p dir={dir}>{t("Create a copy of this app.")}</p>
                  <p dir={dir}>
                    {t(
                      "Note: this does not copy over the Supabase project or GitHub project.",
                    )}
                  </p>
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 my-2">
                <div>
                  <Label dir={dir} htmlFor="newAppName">
                    {t("New app name")}
                  </Label>
                  <div className="relative mt-1">
                    <Input
                      dir={dir}
                      id="newAppName"
                      value={newCopyAppName}
                      onChange={handleAppNameChange}
                      placeholder={t("Enter new app name")}
                      className="pr-8"
                      disabled={copyAppMutation.isPending}
                    />
                    {isCheckingName && (
                      <div className="absolute right-2 top-1/2 -translate-y-1/2">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      </div>
                    )}
                  </div>

                  {nameExists && (
                    <p
                      dir={dir}
                      className="text-xs text-yellow-600 dark:text-yellow-500 mt-1"
                    >
                      {t(
                        "An app with this name already exists. Please choose another name.",
                      )}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Button
                    dir={dir}
                    variant="outline"
                    className="w-full justify-start p-2 h-auto relative text-sm"
                    onClick={() => copyAppMutation.mutate({ withHistory: true })}
                    disabled={
                      copyAppMutation.isPending ||
                      nameExists ||
                      !newCopyAppName.trim() ||
                      isCheckingName
                    }
                  >
                    {copyAppMutation.isPending &&
                      copyAppMutation.variables?.withHistory === true && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                    <div className="absolute top-1 right-1">
                      <span
                        dir={dir}
                        className="bg-blue-100 text-blue-800 text-xs font-medium px-1.5 py-0.5 rounded dark:bg-blue-900 dark:text-blue-300 text-[10px]"
                      >
                        {t("Recommended")}
                      </span>
                    </div>
                    <div className="text-left">
                      <p dir={dir} className="font-medium text-xs">
                        {t("Copy app with history")}
                      </p>
                      <p dir={dir} className="text-xs text-gray-500 dark:text-gray-400">
                        {t("Copies the entire app, including the Git version history.")}
                      </p>
                    </div>
                  </Button>

                  <Button
                    dir={dir}
                    variant="outline"
                    className="w-full justify-start p-2 h-auto text-sm"
                    onClick={() => copyAppMutation.mutate({ withHistory: false })}
                    disabled={
                      copyAppMutation.isPending ||
                      nameExists ||
                      !newCopyAppName.trim() ||
                      isCheckingName
                    }
                  >
                    {copyAppMutation.isPending &&
                      copyAppMutation.variables?.withHistory === false && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                    <div className="text-left">
                      <p dir={dir} className="font-medium text-xs">
                        {t("Copy app without history")}
                      </p>
                      <p dir={dir} className="text-xs text-gray-500 dark:text-gray-400">
                        {t("Useful if the current app has a Git-related issue.")}
                      </p>
                    </div>
                  </Button>
                </div>
              </div>
              <DialogFooter className="pt-2">
                <Button
                  dir={dir}
                  variant="outline"
                  onClick={() => setIsCopyDialogOpen(false)}
                  disabled={copyAppMutation.isPending}
                  size="sm"
                >
                  {t("Cancel")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Delete Confirmation Dialog */}
        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <DialogContent className="max-w-sm p-4">
            <DialogHeader className="pb-2">
              <DialogTitle dir={dir}>
                {t('Delete "name"?', { name: selectedApp.name })}
              </DialogTitle>
              <DialogDescription dir={dir} className="text-xs">
                {t(
                  "This action is irreversible. All app files and chat history will be permanently deleted.",
                )}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex justify-end gap-2 pt-2">
              <Button
                dir={dir}
                variant="outline"
                onClick={() => setIsDeleteDialogOpen(false)}
                disabled={isDeleting}
                size="sm"
              >
                {t("Cancel")}
              </Button>
              <Button
                dir={dir}
                variant="destructive"
                onClick={handleDeleteApp}
                disabled={isDeleting}
                className="flex items-center gap-1"
                size="sm"
              >
                {isDeleting ? (
                  <>
                    <svg
                      className="animate-spin h-3 w-3 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    {t("Deleting...")}
                  </>
                ) : (
                  t("Delete App")
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
