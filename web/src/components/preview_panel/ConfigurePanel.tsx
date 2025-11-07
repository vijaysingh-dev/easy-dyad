import { useState, useCallback } from "react";
import { useI18n } from "@/lib/i18n";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Trash2, Edit2, Plus, Save, X, HelpCircle, ArrowRight } from "lucide-react";
import { showError, showSuccess } from "@/components/Toast";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { useNavigate } from "@tanstack/react-router";
import { NeonConfigure } from "./NeonConfigure";
import api from "@/api";

const EnvironmentVariablesTitle = () => {
  const { t, dir } = useI18n();
  return (
    <div dir={dir} className="flex items-center gap-2">
      <span dir={dir} className="text-lg font-semibold">
        {t("Environment Variables")}
      </span>
      <span dir={dir} className="text-sm text-muted-foreground font-normal">
        {t("Local")}
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <HelpCircle size={16} className="text-muted-foreground cursor-help" />
        </TooltipTrigger>
        <TooltipContent dir={dir}>
          <p dir={dir}>
            {t(
              "To modify environment variables for Supabase or production, access your hosting provider's console and update them there."
            )}
          </p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
};

export const ConfigurePanel = () => {
  const { t, dir } = useI18n();
  const selectedAppId = useAtomValue(selectedAppIdAtom);
  const queryClient = useQueryClient();

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingKeyValue, setEditingKeyValue] = useState("");
  const [editingValue, setEditingValue] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [isAddingNew, setIsAddingNew] = useState(false);
  const navigate = useNavigate();

  // Query to get environment variables
  const {
    data: envVars = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["app-env-vars", selectedAppId],
    queryFn: async () => {
      if (!selectedAppId) return [];
      return await api.app.getAppEnvVars({ appId: selectedAppId });
    },
    enabled: !!selectedAppId,
  });

  // Mutation to save environment variables
  const saveEnvVarsMutation = useMutation({
    mutationFn: async (newEnvVars: { key: string; value: string }[]) => {
      if (!selectedAppId) throw new Error(t("No app selected"));
      return await api.app.setAppEnvVars({
        appId: selectedAppId,
        envVars: newEnvVars,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["app-env-vars", selectedAppId],
      });
      showSuccess(t("Environment variables saved"));
    },
    onError: (error) => {
      showError(
        t("Failed to save environment variables: error", { error: String(error) })
      );
    },
  });

  const handleAdd = useCallback(() => {
    if (!newKey.trim() || !newValue.trim()) {
      showError(t("Both key and value are required"));
      return;
    }

    // Check for duplicate keys
    if (envVars.some((envVar) => envVar.key === newKey.trim())) {
      showError(t("Environment variable with this key already exists"));
      return;
    }

    const newEnvVars = [...envVars, { key: newKey.trim(), value: newValue.trim() }];
    saveEnvVarsMutation.mutate(newEnvVars);
    setNewKey("");
    setNewValue("");
    setIsAddingNew(false);
  }, [newKey, newValue, envVars, saveEnvVarsMutation, t]);

  const handleEdit = useCallback((envVar: { key: string; value: string }) => {
    setEditingKey(envVar.key);
    setEditingKeyValue(envVar.key);
    setEditingValue(envVar.value);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editingKeyValue.trim() || !editingValue.trim()) {
      showError(t("Both key and value are required"));
      return;
    }

    // Check for duplicate keys (excluding the current one being edited)
    if (
      envVars.some(
        (envVar) => envVar.key === editingKeyValue.trim() && envVar.key !== editingKey
      )
    ) {
      showError(t("Environment variable with this key already exists"));
      return;
    }

    const newEnvVars = envVars.map((envVar) =>
      envVar.key === editingKey
        ? { key: editingKeyValue.trim(), value: editingValue.trim() }
        : envVar
    );
    saveEnvVarsMutation.mutate(newEnvVars);
    setEditingKey(null);
    setEditingKeyValue("");
    setEditingValue("");
  }, [editingKey, editingKeyValue, editingValue, envVars, saveEnvVarsMutation, t]);

  const handleCancelEdit = useCallback(() => {
    setEditingKey(null);
    setEditingKeyValue("");
    setEditingValue("");
  }, []);

  const handleDelete = useCallback(
    (key: string) => {
      const newEnvVars = envVars.filter((envVar) => envVar.key !== key);
      saveEnvVarsMutation.mutate(newEnvVars);
    },
    [envVars, saveEnvVarsMutation]
  );

  const handleCancelAdd = useCallback(() => {
    setIsAddingNew(false);
    setNewKey("");
    setNewValue("");
  }, []);

  // Show loading state
  if (isLoading) {
    return (
      <div dir={dir} className="p-4 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>
              <EnvironmentVariablesTitle />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <div dir={dir} className="text-sm text-muted-foreground">
                {t("Loading environment variables...")}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div dir={dir} className="p-4 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>
              <EnvironmentVariablesTitle />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <div dir={dir} className="text-sm text-red-500">
                {t("Error loading environment variables: error", {
                  error: error.message,
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show no app selected state
  if (!selectedAppId) {
    return (
      <div dir={dir} className="p-4 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>
              <EnvironmentVariablesTitle />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <div dir={dir} className="text-sm text-muted-foreground">
                {t("Select an app to manage environment variables")}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div dir={dir} className="p-4 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>
            <EnvironmentVariablesTitle />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add new environment variable form */}
          {isAddingNew ? (
            <div dir={dir} className="space-y-3 p-3 border rounded-md bg-muted/50">
              <div className="space-y-2">
                <Label dir={dir} htmlFor="new-key">
                  {t("Key")}
                </Label>
                <Input
                  id="new-key"
                  placeholder={t("e.g., API_URL")}
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label dir={dir} htmlFor="new-value">
                  {t("Value")}
                </Label>
                <Input
                  id="new-value"
                  placeholder={t("e.g., https://api.example.com")}
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleAdd}
                  size="sm"
                  disabled={saveEnvVarsMutation.isPending}
                >
                  <Save size={14} />
                  {saveEnvVarsMutation.isPending ? t("Saving...") : t("Save")}
                </Button>
                <Button onClick={handleCancelAdd} variant="outline" size="sm">
                  <X size={14} />
                  {t("Cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              onClick={() => setIsAddingNew(true)}
              variant="outline"
              className="w-full"
            >
              <Plus size={14} />
              {t("Add Environment Variable")}
            </Button>
          )}

          {/* List of existing environment variables */}
          <div className="space-y-2">
            {envVars.length === 0 ? (
              <p dir={dir} className="text-sm text-muted-foreground text-center py-8">
                {t("No environment variables configured")}
              </p>
            ) : (
              envVars.map((envVar) => (
                <div
                  dir={dir}
                  key={envVar.key}
                  className="flex items-center space-x-2 p-2 border rounded-md"
                >
                  {editingKey === envVar.key ? (
                    <>
                      <div className="flex-1 space-y-2">
                        <Input
                          value={editingKeyValue}
                          onChange={(e) => setEditingKeyValue(e.target.value)}
                          placeholder={t("Key")}
                          className="h-8"
                        />
                        <Input
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          placeholder={t("Value")}
                          className="h-8"
                        />
                      </div>
                      <div className="flex gap-1">
                        <Button
                          data-testid={`save-edit-env-var`}
                          onClick={handleSaveEdit}
                          size="sm"
                          variant="outline"
                          disabled={saveEnvVarsMutation.isPending}
                        >
                          <Save size={14} />
                        </Button>
                        <Button
                          data-testid={`cancel-edit-env-var`}
                          onClick={handleCancelEdit}
                          size="sm"
                          variant="outline"
                        >
                          <X size={14} />
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{envVar.key}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {envVar.value}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          data-testid={`edit-env-var-${envVar.key}`}
                          onClick={() => handleEdit(envVar)}
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                        >
                          <Edit2 size={14} />
                        </Button>
                        <Button
                          data-testid={`delete-env-var-${envVar.key}`}
                          onClick={() => handleDelete(envVar.key)}
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          disabled={saveEnvVarsMutation.isPending}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>

          {/* More app configurations button */}
          <div className="pt-4 border-t">
            <Button
              variant="outline"
              className="w-full text-sm justify-between"
              onClick={() => {
                if (selectedAppId) {
                  navigate({
                    to: "/app-details",
                    search: { appId: selectedAppId },
                  });
                }
              }}
            >
              <span dir={dir}>{t("More app settings")}</span>
              <ArrowRight size={16} />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Neon Database Configuration */}
      {/* Neon Connector */}
      <div className="grid grid-cols-1 gap-6">
        <NeonConfigure />
      </div>
    </div>
  );
};
