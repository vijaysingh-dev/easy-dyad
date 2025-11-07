import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { showSuccess } from "@/components/Toast";
import { Smartphone, TabletSmartphone, Loader2, ExternalLink, Copy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import api from "@/api";

interface CapacitorControlsProps {
  appId: number;
}

type CapacitorStatus = "idle" | "syncing" | "opening";

export function CapacitorControls({ appId }: CapacitorControlsProps) {
  const { t, dir } = useI18n();
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const [errorDetails, setErrorDetails] = useState<{
    title: string;
    message: string;
  } | null>(null);
  const [iosStatus, setIosStatus] = useState<CapacitorStatus>("idle");
  const [androidStatus, setAndroidStatus] = useState<CapacitorStatus>("idle");

  // Check if Capacitor is installed
  const { data: isCapacitor, isLoading } = useQuery({
    queryKey: ["is-capacitor", appId],
    queryFn: () => api.app.isCapacitor({ appId }),
    enabled: appId !== undefined && appId !== null,
  });

  const showErrorDialog = (title: string, error: unknown) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    setErrorDetails({ title, message: errorMessage });
    setErrorDialogOpen(true);
  };

  // Sync and open iOS mutation
  const syncAndOpenIosMutation = useMutation({
    mutationFn: async () => {
      setIosStatus("syncing");
      // First sync
      await api.app.syncCapacitor({ appId });
      setIosStatus("opening");
      // Then open iOS
      await api.app.openIos({ appId });
    },
    onSuccess: () => {
      setIosStatus("idle");
      showSuccess(t("Synced and opened iOS project in Xcode"));
    },
    onError: (error) => {
      setIosStatus("idle");
      showErrorDialog("Failed to sync and open iOS project", error);
    },
  });

  // Sync and open Android mutation
  const syncAndOpenAndroidMutation = useMutation({
    mutationFn: async () => {
      setAndroidStatus("syncing");
      // First sync
      await api.app.syncCapacitor({ appId });
      setAndroidStatus("opening");
      // Then open Android
      await api.app.openAndroid({ appId });
    },
    onSuccess: () => {
      setAndroidStatus("idle");
      showSuccess(t("Synced and opened Android project in Android Studio"));
    },
    onError: (error) => {
      setAndroidStatus("idle");
      showErrorDialog("Failed to sync and open Android project", error);
    },
  });

  // Helper function to get button text based on status
  const getIosButtonText = () => {
    switch (iosStatus) {
      case "syncing":
        return { main: t("Syncing..."), sub: t("Building app") };
      case "opening":
        return { main: t("Opening..."), sub: t("Launching Xcode") };
      default:
        return { main: t("Sync & Open iOS"), sub: t("Xcode") };
    }
  };

  const getAndroidButtonText = () => {
    switch (androidStatus) {
      case "syncing":
        return { main: t("Syncing..."), sub: t("Building app") };
      case "opening":
        return { main: t("Opening..."), sub: t("Launching Android Studio") };
      default:
        return { main: t("Sync & Open Android"), sub: t("Android Studio") };
    }
  };

  // Don't render anything if loading or if Capacitor is not installed
  if (isLoading || !isCapacitor) {
    return null;
  }

  const iosButtonText = getIosButtonText();
  const androidButtonText = getAndroidButtonText();

  return (
    <>
      <Card className="mt-1" data-testid="capacitor-controls" dir={dir}>
        <CardHeader dir={dir}>
          <CardTitle className="flex items-center justify-between" dir={dir}>
            {t("Mobile Development")}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                // TODO: Add actual help link
                api.app.openExternalUrl(
                  "https://dyad.sh/docs/guides/mobile-app#troubleshooting"
                );
              }}
              className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center gap-1"
              dir={dir}
            >
              {t("Need help?")}
              <ExternalLink className="h-3 w-3" />
            </Button>
          </CardTitle>
          <CardDescription dir={dir}>
            {t("Sync and open your Capacitor mobile projects")}
          </CardDescription>
        </CardHeader>
        <CardContent dir={dir}>
          <div className="grid grid-cols-2 gap-2" dir={dir}>
            <Button
              onClick={() => syncAndOpenIosMutation.mutate()}
              disabled={syncAndOpenIosMutation.isPending}
              variant="outline"
              size="sm"
              className="flex items-center gap-2 h-10"
              dir={dir}
            >
              {syncAndOpenIosMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Smartphone className="h-4 w-4" />
              )}
              <div className="text-left" dir={dir}>
                <div className="text-xs font-medium" dir={dir}>
                  {iosButtonText.main}
                </div>
                <div className="text-xs text-gray-500" dir={dir}>
                  {iosButtonText.sub}
                </div>
              </div>
            </Button>

            <Button
              onClick={() => syncAndOpenAndroidMutation.mutate()}
              disabled={syncAndOpenAndroidMutation.isPending}
              variant="outline"
              size="sm"
              className="flex items-center gap-2 h-10"
              dir={dir}
            >
              {syncAndOpenAndroidMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <TabletSmartphone className="h-4 w-4" />
              )}
              <div className="text-left" dir={dir}>
                <div className="text-xs font-medium" dir={dir}>
                  {androidButtonText.main}
                </div>
                <div className="text-xs text-gray-500" dir={dir}>
                  {androidButtonText.sub}
                </div>
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Error Dialog */}
      <Dialog open={errorDialogOpen} onOpenChange={setErrorDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-red-600 dark:text-red-400" dir={dir}>
              {errorDetails?.title}
            </DialogTitle>
            <DialogDescription dir={dir}>
              {t(
                "An error occurred while running the Capacitor command. See details below:"
              )}
            </DialogDescription>
          </DialogHeader>

          {errorDetails && (
            <div className="relative" dir={dir}>
              <div
                className="max-h-[50vh] w-full max-w-md rounded border p-4 bg-gray-50 dark:bg-gray-900 overflow-y-auto"
                dir={dir}
              >
                <pre className="text-xs whitespace-pre-wrap font-mono" dir={dir}>
                  {errorDetails.message}
                </pre>
              </div>
              <Button
                onClick={() => {
                  navigator.clipboard.writeText(errorDetails.message);
                  showSuccess(t("Error details copied to clipboard"));
                }}
                variant="ghost"
                size="sm"
                className="absolute top-2 right-2 h-8 w-8 p-0"
                dir={dir}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          )}

          <div className="flex justify-end gap-2" dir={dir}>
            <Button
              onClick={() => {
                if (errorDetails) {
                  navigator.clipboard.writeText(errorDetails.message);
                  showSuccess(t("Error details copied to clipboard"));
                }
              }}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
              dir={dir}
            >
              <Copy className="h-4 w-4" />
              {t("Copy Error")}
            </Button>
            <Button
              onClick={() => setErrorDialogOpen(false)}
              variant="outline"
              size="sm"
              dir={dir}
            >
              {t("Close")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
