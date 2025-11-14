import React, { useState, useEffect } from "react";
import { useI18n } from "@/lib/i18n";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useCustomLanguageModelProvider } from "@/hooks/useCustomLanguageModelProvider";
import type { LanguageModelProvider } from "@/shared/eeziTypes";

interface CreateCustomProviderDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editingProvider?: LanguageModelProvider | null;
}

export function CreateCustomProviderDialog({
  isOpen,
  onClose,
  onSuccess,
  editingProvider = null,
}: CreateCustomProviderDialogProps) {
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [envVarName, setEnvVarName] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const isEditMode = Boolean(editingProvider);

  const { t, dir } = useI18n();
  const { createProvider, editProvider, isCreating, isEditing, error } =
    useCustomLanguageModelProvider();
  // Load provider data when editing
  useEffect(() => {
    if (editingProvider && isOpen) {
      const cleanId = editingProvider.id?.startsWith("custom::")
        ? editingProvider.id.replace("custom::", "")
        : editingProvider.id || "";
      setId(cleanId);
      setName(editingProvider.name || "");
      setApiBaseUrl(editingProvider.apiBaseUrl || "");
      setEnvVarName(editingProvider.envVarName || "");
    } else if (!isOpen) {
      // Reset form when dialog closes
      setId("");
      setName("");
      setApiBaseUrl("");
      setEnvVarName("");
      setErrorMessage("");
    }
  }, [editingProvider, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    try {
      if (isEditMode && editingProvider) {
        const cleanId = editingProvider.id?.startsWith("custom::")
          ? editingProvider.id.replace("custom::", "")
          : editingProvider.id || "";
        await editProvider({
          id: cleanId,
          name: name.trim(),
          apiBaseUrl: apiBaseUrl.trim(),
          envVarName: envVarName.trim() || undefined,
        });
      } else {
        await createProvider({
          id: id.trim(),
          name: name.trim(),
          apiBaseUrl: apiBaseUrl.trim(),
          envVarName: envVarName.trim() || undefined,
        });
      }

      // Reset form
      setId("");
      setName("");
      setApiBaseUrl("");
      setEnvVarName("");

      onSuccess();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : `Failed to ${isEditMode ? "edit" : "create"} custom provider`
      );
    }
  };

  const handleClose = () => {
    if (!isCreating && !isEditing) {
      setErrorMessage("");
      onClose();
    }
  };
  const isLoading = isCreating || isEditing;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle dir={dir}>
            {isEditMode ? t("Edit Custom Provider") : t("Add Custom Provider")}
          </DialogTitle>
          <DialogDescription dir={dir}>
            {isEditMode
              ? t("Update your custom language model provider configuration.")
              : t("Connect to a custom language model provider API.")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="id" dir={dir}>
              {t("Provider ID")}
            </Label>
            <Input
              id="id"
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder={t("E.g., my-provider")}
              required
              disabled={isLoading || isEditMode}
            />
            <p className="text-xs text-muted-foreground" dir={dir}>
              {t("A unique identifier for this provider (no spaces).")}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name" dir={dir}>
              {t("Display Name")}
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("E.g., My Provider")}
              required
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground" dir={dir}>
              {t("The name that will be displayed in the UI.")}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="apiBaseUrl" dir={dir}>
              {t("API Base URL")}
            </Label>
            <Input
              id="apiBaseUrl"
              value={apiBaseUrl}
              onChange={(e) => setApiBaseUrl(e.target.value)}
              placeholder={t("E.g., https://api.example.com/v1")}
              required
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground" dir={dir}>
              {t("The base URL for the API endpoint.")}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="envVarName" dir={dir}>
              {t("Environment Variable (Optional)")}
            </Label>
            <Input
              id="envVarName"
              value={envVarName}
              onChange={(e) => setEnvVarName(e.target.value)}
              placeholder={t("E.g., MY_PROVIDER_API_KEY")}
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground" dir={dir}>
              {t("Environment variable name for the API key.")}
            </p>
          </div>

          {(errorMessage || error) && (
            <div className="text-sm text-red-500" dir={dir}>
              {errorMessage ||
                (error instanceof Error
                  ? error.message
                  : t("Failed to create custom provider"))}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
              dir={dir}
            >
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={isLoading} dir={dir}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLoading
                ? isEditMode
                  ? t("Updating...")
                  : t("Adding...")
                : isEditMode
                ? t("Update Provider")
                : t("Add Provider")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
