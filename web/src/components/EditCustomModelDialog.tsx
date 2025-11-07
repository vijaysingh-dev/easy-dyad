import React, { useState, useEffect } from "react";
import { useI18n } from "@/lib/i18n";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMutation } from "@tanstack/react-query";
import { showError, showSuccess } from "@/components/Toast";
import api from "@/api";

interface Model {
  apiName: string;
  displayName: string;
  description?: string;
  maxOutputTokens?: number;
  contextWindow?: number;
  type: "cloud" | "custom";
  tag?: string;
}

interface EditCustomModelDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  providerId: string;
  model: Model | null;
}

export function EditCustomModelDialog({
  isOpen,
  onClose,
  onSuccess,
  providerId,
  model,
}: EditCustomModelDialogProps) {
  const { t, dir } = useI18n();

  const [apiName, setApiName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [maxOutputTokens, setMaxOutputTokens] = useState<string>("");
  const [contextWindow, setContextWindow] = useState<string>("");

  useEffect(() => {
    if (model) {
      setApiName(model.apiName);
      setDisplayName(model.displayName);
      setDescription(model.description || "");
      setMaxOutputTokens(model.maxOutputTokens?.toString() || "");
      setContextWindow(model.contextWindow?.toString() || "");
    }
  }, [model]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!model) throw new Error("No model to edit");

      const newParams = {
        apiName,
        displayName,
        providerId,
        description: description || undefined,
        maxOutputTokens: maxOutputTokens ? parseInt(maxOutputTokens, 10) : undefined,
        contextWindow: contextWindow ? parseInt(contextWindow, 10) : undefined,
      };

      if (!newParams.apiName) throw new Error("Model API name is required");
      if (!newParams.displayName) throw new Error("Model display name is required");
      if (maxOutputTokens && isNaN(newParams.maxOutputTokens ?? NaN))
        throw new Error("Max Output Tokens must be a valid number");
      if (contextWindow && isNaN(newParams.contextWindow ?? NaN))
        throw new Error("Context Window must be a valid number");

      // First delete the old model
      await api.llm.deleteCustomModel({
        providerId,
        modelApiName: model.apiName,
      });

      // Then create the new model
      await api.llm.createCustomLanguageModel(newParams);
    },
    onSuccess: () => {
      showSuccess("Custom model updated successfully!");
      onSuccess();
      onClose();
    },
    onError: (error) => {
      showError(error);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  const handleClose = () => {
    if (!mutation.isPending) {
      onClose();
    }
  };

  if (!model) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle dir={dir}>{t("Edit Custom Model")}</DialogTitle>
          <DialogDescription dir={dir}>
            {t("Modify the configuration of the selected language model.")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-model-id" className="text-right" dir={dir}>
                {t("Model ID*")}
              </Label>
              <Input
                id="edit-model-id"
                value={apiName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setApiName(e.target.value)
                }
                className="col-span-3"
                placeholder={t("This must match the model expected by the API")}
                required
                disabled={mutation.isPending}
                dir={dir}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-model-name" className="text-right" dir={dir}>
                {t("Name*")}
              </Label>
              <Input
                id="edit-model-name"
                value={displayName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setDisplayName(e.target.value)
                }
                className="col-span-3"
                placeholder={t("Human-friendly name for the model")}
                required
                disabled={mutation.isPending}
                dir={dir}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-description" className="text-right" dir={dir}>
                {t("Description")}
              </Label>
              <Input
                id="edit-description"
                value={description}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setDescription(e.target.value)
                }
                className="col-span-3"
                placeholder={t("Optional: Describe the model's capabilities")}
                disabled={mutation.isPending}
                dir={dir}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-max-output-tokens" className="text-right" dir={dir}>
                {t("Max Output Tokens")}
              </Label>
              <Input
                id="edit-max-output-tokens"
                type="number"
                value={maxOutputTokens}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setMaxOutputTokens(e.target.value)
                }
                className="col-span-3"
                placeholder={t("Optional: e.g., 4096")}
                disabled={mutation.isPending}
                dir={dir}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-context-window" className="text-right" dir={dir}>
                {t("Context Window")}
              </Label>
              <Input
                id="edit-context-window"
                type="number"
                value={contextWindow}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setContextWindow(e.target.value)
                }
                className="col-span-3"
                placeholder={t("Optional: e.g., 8192")}
                disabled={mutation.isPending}
                dir={dir}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={mutation.isPending}
              dir={dir}
            >
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={mutation.isPending} dir={dir}>
              {mutation.isPending ? t("Updating...") : t("Update Model")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
