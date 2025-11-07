import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";
import { useNavigate } from "@tanstack/react-router";
import { providerSettingsRoute } from "@/routes/settings/providers/$provider";
import type { LanguageModelProvider } from "@shared/eeziTypes";

import { useLanguageModelProviders } from "@/hooks/useLanguageModelProviders";
import { useCustomLanguageModelProvider } from "@/hooks/useCustomLanguageModelProvider";
import { GiftIcon, PlusIcon, MoreVertical, Trash2, Edit } from "lucide-react";
import { Skeleton } from "./ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { AlertTriangle } from "lucide-react";
import { useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { CreateCustomProviderDialog } from "./CreateCustomProviderDialog";

export function ProviderSettingsGrid() {
  const { t, dir } = useI18n();
  const navigate = useNavigate();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<LanguageModelProvider | null>(
    null
  );
  const [providerToDelete, setProviderToDelete] = useState<string | null>(null);

  const {
    data: providers,
    isLoading,
    error,
    isProviderSetup,
    refetch,
  } = useLanguageModelProviders();

  const { deleteProvider, isDeleting } = useCustomLanguageModelProvider();

  const handleProviderClick = (providerId: string) => {
    navigate({
      to: providerSettingsRoute.id,
      params: { provider: providerId },
    });
  };

  const handleDeleteProvider = async () => {
    if (providerToDelete) {
      await deleteProvider(providerToDelete);
      setProviderToDelete(null);
      refetch();
    }
  };

  const handleEditProvider = (provider: LanguageModelProvider) => {
    setEditingProvider(provider);
    setIsDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <h2 dir={dir} className="text-lg font-medium mb-6">
          {t("AI Providers")}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Card key={i} className="border-border">
              <CardHeader className="p-4">
                <Skeleton className="h-6 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <h2 dir={dir} className="text-lg font-medium mb-6">
          {t("AI Providers")}
        </h2>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle dir={dir}>{t("Error")}</AlertTitle>
          <AlertDescription dir={dir}>
            {t("Failed to load AI providers: message", { message: error.message })}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h2 dir={dir} className="text-lg font-medium mb-6">
        {t("AI Providers")}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {providers
          ?.filter((p) => p.type !== "local")
          .map((provider: LanguageModelProvider) => {
            const isCustom = provider.type === "custom";

            return (
              <Card
                key={provider.id}
                className="relative transition-all hover:shadow-md border-border"
              >
                <CardHeader
                  className="p-4 cursor-pointer"
                  onClick={() => handleProviderClick(provider.id)}
                >
                  <CardTitle
                    dir={dir}
                    className="text-lg font-medium flex items-center justify-between mr-5"
                  >
                    {provider.name}
                    {isProviderSetup(provider.id) ? (
                      <span
                        dir={dir}
                        className="ml-3 text-sm font-medium text-green-500 bg-green-50 dark:bg-green-900/30 border border-green-500/50 dark:border-green-500/50 px-2 py-1 rounded-full"
                      >
                        {t("Ready")}
                      </span>
                    ) : (
                      <span
                        dir={dir}
                        className="text-sm text-gray-500 bg-gray-50 dark:bg-gray-900 dark:text-gray-300 px-2 py-1 rounded-full"
                      >
                        {t("Needs Setup")}
                      </span>
                    )}
                  </CardTitle>
                  <CardDescription dir={dir}>
                    {provider.hasFreeTier && (
                      <span
                        dir={dir}
                        className="text-blue-600 mt-2 dark:text-blue-400 text-sm font-medium bg-blue-100 dark:bg-blue-900/30 px-2 py-1 rounded-full inline-flex items-center"
                      >
                        <GiftIcon className="w-4 h-4 mr-1" />
                        {t("Free tier available")}
                      </span>
                    )}
                  </CardDescription>
                </CardHeader>

                {isCustom && (
                  <div
                    className="absolute top-2 right-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="p-1 hover:bg-muted rounded-full focus:outline-none"
                          data-testid="custom-provider-more-options"
                        >
                          <MoreVertical className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-48 p-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start mb-1"
                          onClick={() => handleEditProvider(provider)}
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          {t("Edit Provider")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setProviderToDelete(provider.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          {t("Delete Provider")}
                        </Button>
                      </PopoverContent>
                    </Popover>
                  </div>
                )}
              </Card>
            );
          })}

        {/* Add custom provider button */}
        <Card
          className="cursor-pointer transition-all hover:shadow-md border-border border-dashed hover:border-primary/70"
          onClick={() => setIsDialogOpen(true)}
        >
          <CardHeader
            dir={dir}
            className="p-4 flex flex-col items-center justify-center h-full"
          >
            <PlusIcon className="h-8 w-8 text-muted-foreground mb-2" />
            <CardTitle dir={dir} className="text-lg font-medium text-center">
              {t("Add custom provider")}
            </CardTitle>
            <CardDescription dir={dir} className="text-center">
              {t("Connect to a custom LLM API endpoint")}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      <CreateCustomProviderDialog
        isOpen={isDialogOpen}
        onClose={() => {
          setIsDialogOpen(false);
          setEditingProvider(null);
        }}
        onSuccess={() => {
          setIsDialogOpen(false);
          refetch();
          setEditingProvider(null);
        }}
        editingProvider={editingProvider}
      />

      <AlertDialog
        open={!!providerToDelete}
        onOpenChange={(open) => !open && setProviderToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle dir={dir}>{t("Delete Custom Provider")}</AlertDialogTitle>
            <AlertDialogDescription dir={dir}>
              {t(
                "This will permanently delete this custom provider and all its associated models. This action cannot be undone."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel dir={dir} disabled={isDeleting}>
              {t("Cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              dir={dir}
              onClick={handleDeleteProvider}
              disabled={isDeleting}
            >
              {isDeleting ? t("Deleting...") : t("Delete Provider")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
