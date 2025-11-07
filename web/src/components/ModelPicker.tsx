import { isEeziProEnabled, type LargeLanguageModel } from "@shared/schemas";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useLocalModels } from "@/hooks/useLocalModels";
import { useLocalLMSModels } from "@/hooks/useLMStudioModels";
import { useLanguageModelsByProviders } from "@/hooks/useLanguageModelsByProviders";

import { LocalModel } from "@shared/eeziTypes";
import { useLanguageModelProviders } from "@/hooks/useLanguageModelProviders";
import { useSettings } from "@/hooks/useSettings";
import { PriceBadge } from "@/components/PriceBadge";
import { TURBO_MODELS } from "@shared/constants";
import { cn } from "@/lib/utils";

export function ModelPicker() {
  const { t, dir } = useI18n();
  const { settings, updateSettings } = useSettings();
  const onModelSelect = (model: LargeLanguageModel) => {
    updateSettings({ selectedModel: model });
  };

  const [open, setOpen] = useState(false);

  // Cloud models from providers
  const { data: modelsByProviders, isLoading: modelsByProvidersLoading } =
    useLanguageModelsByProviders();

  const { data: providers, isLoading: providersLoading } = useLanguageModelProviders();

  const loading = modelsByProvidersLoading || providersLoading;
  // Ollama Models Hook
  const {
    models: ollamaModels,
    loading: ollamaLoading,
    error: ollamaError,
    loadModels: loadOllamaModels,
  } = useLocalModels();

  // LM Studio Models Hook
  const {
    models: lmStudioModels,
    loading: lmStudioLoading,
    error: lmStudioError,
    loadModels: loadLMStudioModels,
  } = useLocalLMSModels();

  // Load models when the dropdown opens
  useEffect(() => {
    if (open) {
      loadOllamaModels();
      loadLMStudioModels();
    }
  }, [open, loadOllamaModels, loadLMStudioModels]);

  // Get display name for the selected model
  const getModelDisplayName = () => {
    if (selectedModel.provider === "ollama") {
      return (
        ollamaModels.find((model: LocalModel) => model.modelName === selectedModel.name)
          ?.displayName || selectedModel.name
      );
    }
    if (selectedModel.provider === "lmstudio") {
      return (
        lmStudioModels.find(
          (model: LocalModel) => model.modelName === selectedModel.name
        )?.displayName || selectedModel.name // Fallback to path if not found
      );
    }

    // For cloud models, look up in the modelsByProviders data
    if (modelsByProviders && modelsByProviders[selectedModel.provider]) {
      const customFoundModel = modelsByProviders[selectedModel.provider].find(
        (model) => model.type === "custom" && model.id === selectedModel.customModelId
      );
      if (customFoundModel) {
        return customFoundModel.displayName;
      }
      const foundModel = modelsByProviders[selectedModel.provider].find(
        (model) => model.apiName === selectedModel.name
      );
      if (foundModel) {
        return foundModel.displayName;
      }
    }

    // Fallback if not found
    return selectedModel.name;
  };

  // Get auto provider models (if any)
  const autoModels =
    !loading && modelsByProviders && modelsByProviders["auto"]
      ? modelsByProviders["auto"].filter((model) => {
          if (
            settings &&
            !isEeziProEnabled(settings) &&
            ["turbo", "value"].includes(model.apiName)
          ) {
            return false;
          }
          if (settings && isEeziProEnabled(settings) && model.apiName === "free") {
            return false;
          }
          return true;
        })
      : [];

  // Determine availability of local models
  const hasOllamaModels = !ollamaLoading && !ollamaError && ollamaModels.length > 0;
  const hasLMStudioModels =
    !lmStudioLoading && !lmStudioError && lmStudioModels.length > 0;

  if (!settings) {
    return null;
  }
  const selectedModel = settings?.selectedModel;
  const isSmartAutoEnabled =
    settings.enableProSmartFilesContextMode && isEeziProEnabled(settings);
  const modelDisplayName = getModelDisplayName();
  // Split providers into primary and secondary groups (excluding auto)
  const providerEntries =
    !loading && modelsByProviders
      ? Object.entries(modelsByProviders).filter(([providerId]) => providerId !== "auto")
      : [];
  const primaryProviders = providerEntries.filter(([providerId, models]) => {
    if (models.length === 0) return false;
    const provider = providers?.find((p) => p.id === providerId);
    return !(provider && provider.secondary);
  });
  if (settings && isEeziProEnabled(settings)) {
    primaryProviders.unshift(["auto", TURBO_MODELS]);
  }
  const secondaryProviders = providerEntries.filter(([providerId, models]) => {
    if (models.length === 0) return false;
    const provider = providers?.find((p) => p.id === providerId);
    return !!(provider && provider.secondary);
  });

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-2 h-8 max-w-[130px] px-1.5 text-xs-sm"
            >
              <span className="truncate" dir={dir}>
                {modelDisplayName === "Auto" && (
                  <>
                    <span className="text-xs text-muted-foreground" dir={dir}>
                      {t("Model:")}
                    </span>{" "}
                  </>
                )}
                {modelDisplayName}
              </span>
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent dir={dir}>{modelDisplayName}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        className="w-64"
        align="start"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DropdownMenuLabel dir={dir}>{t("Cloud Models")}</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Cloud models - loading state */}
        {loading ? (
          <div className="text-xs text-center py-2 text-muted-foreground" dir={dir}>
            {t("Loading models...")}
          </div>
        ) : !modelsByProviders || Object.keys(modelsByProviders).length === 0 ? (
          <div className="text-xs text-center py-2 text-muted-foreground" dir={dir}>
            {t("No cloud models available")}
          </div>
        ) : (
          /* Cloud models loaded */
          <>
            {/* Auto models at top level if any */}
            {autoModels.length > 0 && (
              <>
                {autoModels.map((model) => (
                  <Tooltip key={`auto-${model.apiName}`}>
                    <TooltipTrigger asChild>
                      <DropdownMenuItem
                        className={
                          selectedModel.provider === "auto" &&
                          selectedModel.name === model.apiName
                            ? "bg-secondary"
                            : ""
                        }
                        onClick={() => {
                          onModelSelect({
                            name: model.apiName,
                            provider: "auto",
                          });
                          setOpen(false);
                        }}
                        dir={dir}
                      >
                        <div className="flex justify-between items-start w-full">
                          <span className="flex flex-col items-start" dir={dir}>
                            <span>
                              {isSmartAutoEnabled && model.apiName === "auto"
                                ? t("Smart Auto")
                                : model.displayName}
                            </span>
                          </span>
                          <div className="flex items-center gap-1.5">
                            {isSmartAutoEnabled &&
                              !model.displayName.includes("(Pro)") && (
                                <span
                                  className="text-[11px] bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-600 bg-[length:200%_100%] animate-[shimmer_5s_ease-in-out_infinite] text-white px-1.5 py-0.5 rounded-full font-medium"
                                  dir={dir}
                                >
                                  {t("Pro only")}
                                </span>
                              )}
                            {model.tag && (
                              <span
                                className={cn(
                                  "text-[11px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium",
                                  model.tagColor
                                )}
                                dir={dir}
                              >
                                {model.tag}
                              </span>
                            )}
                          </div>
                        </div>
                      </DropdownMenuItem>
                    </TooltipTrigger>
                    <TooltipContent side="right" dir={dir}>
                      {isSmartAutoEnabled && model.apiName === "auto" ? (
                        <p dir={dir}>
                          <strong>{t("Smart Auto")}</strong>{" "}
                          {t(
                            "uses a cheaper model for easier tasks and a flagship model for harder tasks"
                          )}
                        </p>
                      ) : (
                        model.description
                      )}
                    </TooltipContent>
                  </Tooltip>
                ))}
                {Object.keys(modelsByProviders).length > 1 && <DropdownMenuSeparator />}
              </>
            )}

            {/* Primary providers as submenus */}
            {primaryProviders.map(([providerId, models]) => {
              models = models.filter((model) => {
                // Don't show free models if Eezi Pro is enabled because
                // we will use the paid models (in Eezi Pro backend) which
                // don't have the free limitations.
                if (isEeziProEnabled(settings) && model.apiName.endsWith(":free")) {
                  return false;
                }
                return true;
              });
              const provider = providers?.find((p) => p.id === providerId);
              const providerDisplayName =
                provider?.id === "auto" ? t("Eezi Turbo") : provider?.name ?? providerId;
              return (
                <DropdownMenuSub key={providerId}>
                  <DropdownMenuSubTrigger className="w-full font-normal" dir={dir}>
                    <div className="flex flex-col items-start w-full">
                      <div className="flex items-center gap-2">
                        <span dir={dir}>{providerDisplayName}</span>
                        {provider?.type === "cloud" &&
                          !provider?.secondary &&
                          isEeziProEnabled(settings) && (
                            <span
                              className="text-[10px] bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-600 bg-[length:200%_100%] animate-[shimmer_5s_ease-in-out_infinite] text-white px-1.5 py-0.5 rounded-full font-medium"
                              dir={dir}
                            >
                              {t("Pro")}
                            </span>
                          )}
                        {provider?.type === "custom" && (
                          <span
                            className="text-[10px] bg-amber-500/20 text-amber-700 px-1.5 py-0.5 rounded-full font-medium"
                            dir={dir}
                          >
                            {t("Custom")}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground" dir={dir}>
                        {t("models count", { count: models.length })}
                      </span>
                    </div>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-56 max-h-100 overflow-y-auto">
                    <DropdownMenuLabel dir={dir}>
                      {providerDisplayName + " " + t("Models")}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {models.map((model) => (
                      <Tooltip key={`${providerId}-${model.apiName}`}>
                        <TooltipTrigger asChild>
                          <DropdownMenuItem
                            className={
                              selectedModel.provider === providerId &&
                              selectedModel.name === model.apiName
                                ? "bg-secondary"
                                : ""
                            }
                            onClick={() => {
                              const customModelId =
                                model.type === "custom" ? model.id : undefined;
                              onModelSelect({
                                name: model.apiName,
                                provider: providerId,
                                customModelId,
                              });
                              setOpen(false);
                            }}
                            dir={dir}
                          >
                            <div className="flex justify-between items-start w-full">
                              <span dir={dir}>{model.displayName}</span>
                              <PriceBadge dollarSigns={model.dollarSigns} />
                              {model.tag && (
                                <span
                                  className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium"
                                  dir={dir}
                                >
                                  {model.tag}
                                </span>
                              )}
                            </div>
                          </DropdownMenuItem>
                        </TooltipTrigger>
                        <TooltipContent side="right" dir={dir}>
                          {model.description}
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              );
            })}

            {/* Secondary providers grouped under Other AI providers */}
            {secondaryProviders.length > 0 && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="w-full font-normal" dir={dir}>
                  <div className="flex flex-col items-start">
                    <span dir={dir}>{t("Other AI providers")}</span>
                    <span className="text-xs text-muted-foreground" dir={dir}>
                      {t("providers count", { count: secondaryProviders.length })}
                    </span>
                  </div>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-56">
                  <DropdownMenuLabel dir={dir}>
                    {t("Other AI providers")}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {secondaryProviders.map(([providerId, models]) => {
                    const provider = providers?.find((p) => p.id === providerId);
                    return (
                      <DropdownMenuSub key={providerId}>
                        <DropdownMenuSubTrigger className="w-full font-normal" dir={dir}>
                          <div className="flex flex-col items-start w-full">
                            <div className="flex items-center gap-2">
                              <span dir={dir}>{provider?.name ?? providerId}</span>
                              {provider?.type === "custom" && (
                                <span
                                  className="text-[10px] bg-amber-500/20 text-amber-700 px-1.5 py-0.5 rounded-full font-medium"
                                  dir={dir}
                                >
                                  {t("Custom")}
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground" dir={dir}>
                              {t("models count", { count: models.length })}
                            </span>
                          </div>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="w-56">
                          <DropdownMenuLabel dir={dir}>
                            {(provider?.name ?? providerId) + " " + t("Models")}
                          </DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {models.map((model) => (
                            <Tooltip key={`${providerId}-${model.apiName}`}>
                              <TooltipTrigger asChild>
                                <DropdownMenuItem
                                  className={
                                    selectedModel.provider === providerId &&
                                    selectedModel.name === model.apiName
                                      ? "bg-secondary"
                                      : ""
                                  }
                                  onClick={() => {
                                    const customModelId =
                                      model.type === "custom" ? model.id : undefined;
                                    onModelSelect({
                                      name: model.apiName,
                                      provider: providerId,
                                      customModelId,
                                    });
                                    setOpen(false);
                                  }}
                                  dir={dir}
                                >
                                  <div className="flex justify-between items-start w-full">
                                    <span dir={dir}>{model.displayName}</span>
                                    {model.tag && (
                                      <span
                                        className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium"
                                        dir={dir}
                                      >
                                        {model.tag}
                                      </span>
                                    )}
                                  </div>
                                </DropdownMenuItem>
                              </TooltipTrigger>
                              <TooltipContent side="right" dir={dir}>
                                {model.description}
                              </TooltipContent>
                            </Tooltip>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    );
                  })}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
          </>
        )}

        <DropdownMenuSeparator />
        {/* Local Models Parent SubMenu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="w-full font-normal" dir={dir}>
            <div className="flex flex-col items-start">
              <span dir={dir}>{t("Local models")}</span>
              <span className="text-xs text-muted-foreground" dir={dir}>
                {t("LM Studio, Ollama")}
              </span>
            </div>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56">
            {/* Ollama Models SubMenu */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger
                disabled={ollamaLoading && !hasOllamaModels} // Disable if loading and no models yet
                className="w-full font-normal"
                dir={dir}
              >
                <div className="flex flex-col items-start">
                  <span dir={dir}>{t("Ollama")}</span>
                  {ollamaLoading ? (
                    <span className="text-xs text-muted-foreground" dir={dir}>
                      {t("Loading...")}
                    </span>
                  ) : ollamaError ? (
                    <span className="text-xs text-red-500" dir={dir}>
                      {t("Error loading")}
                    </span>
                  ) : !hasOllamaModels ? (
                    <span className="text-xs text-muted-foreground" dir={dir}>
                      {t("None available")}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground" dir={dir}>
                      {t("models count", { count: ollamaModels.length })}
                    </span>
                  )}
                </div>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-56 max-h-100 overflow-y-auto">
                <DropdownMenuLabel dir={dir}>{t("Ollama Models")}</DropdownMenuLabel>
                <DropdownMenuSeparator />

                {ollamaLoading && ollamaModels.length === 0 ? ( // Show loading only if no models are loaded yet
                  <div
                    className="text-xs text-center py-2 text-muted-foreground"
                    dir={dir}
                  >
                    {t("Loading models...")}
                  </div>
                ) : ollamaError ? (
                  <div className="px-2 py-1.5 text-sm text-red-600" dir={dir}>
                    <div className="flex flex-col">
                      <span dir={dir}>{t("Error loading models")}</span>
                      <span className="text-xs text-muted-foreground" dir={dir}>
                        {t("Is Ollama running?")}
                      </span>
                    </div>
                  </div>
                ) : !hasOllamaModels ? (
                  <div className="px-2 py-1.5 text-sm" dir={dir}>
                    <div className="flex flex-col">
                      <span dir={dir}>{t("No local models found")}</span>
                      <span className="text-xs text-muted-foreground" dir={dir}>
                        {t("Ensure Ollama is running and models are pulled.")}
                      </span>
                    </div>
                  </div>
                ) : (
                  ollamaModels.map((model: LocalModel) => (
                    <DropdownMenuItem
                      key={`ollama-${model.modelName}`}
                      className={
                        selectedModel.provider === "ollama" &&
                        selectedModel.name === model.modelName
                          ? "bg-secondary"
                          : ""
                      }
                      onClick={() => {
                        onModelSelect({
                          name: model.modelName,
                          provider: "ollama",
                        });
                        setOpen(false);
                      }}
                      dir={dir}
                    >
                      <div className="flex flex-col">
                        <span dir={dir}>{model.displayName}</span>
                        <span
                          className="text-xs text-muted-foreground truncate"
                          dir={dir}
                        >
                          {model.modelName}
                        </span>
                      </div>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            {/* LM Studio Models SubMenu */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger
                disabled={lmStudioLoading && !hasLMStudioModels} // Disable if loading and no models yet
                className="w-full font-normal"
                dir={dir}
              >
                <div className="flex flex-col items-start">
                  <span dir={dir}>{t("LM Studio")}</span>
                  {lmStudioLoading ? (
                    <span className="text-xs text-muted-foreground" dir={dir}>
                      {t("Loading...")}
                    </span>
                  ) : lmStudioError ? (
                    <span className="text-xs text-red-500" dir={dir}>
                      {t("Error loading")}
                    </span>
                  ) : !hasLMStudioModels ? (
                    <span className="text-xs text-muted-foreground" dir={dir}>
                      {t("None available")}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground" dir={dir}>
                      {t("models count", { count: lmStudioModels.length })}
                    </span>
                  )}
                </div>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-56 max-h-100 overflow-y-auto">
                <DropdownMenuLabel dir={dir}>{t("LM Studio Models")}</DropdownMenuLabel>
                <DropdownMenuSeparator />

                {lmStudioLoading && lmStudioModels.length === 0 ? ( // Show loading only if no models are loaded yet
                  <div
                    className="text-xs text-center py-2 text-muted-foreground"
                    dir={dir}
                  >
                    {t("Loading models...")}
                  </div>
                ) : lmStudioError ? (
                  <div className="px-2 py-1.5 text-sm text-red-600" dir={dir}>
                    <div className="flex flex-col">
                      <span dir={dir}>{t("Error loading models")}</span>
                      <span className="text-xs text-muted-foreground" dir={dir}>
                        {lmStudioError.message}
                      </span>
                    </div>
                  </div>
                ) : !hasLMStudioModels ? (
                  <div className="px-2 py-1.5 text-sm" dir={dir}>
                    <div className="flex flex-col">
                      <span dir={dir}>{t("No loaded models found")}</span>
                      <span className="text-xs text-muted-foreground" dir={dir}>
                        {t("Ensure LM Studio is running and models are loaded.")}
                      </span>
                    </div>
                  </div>
                ) : (
                  lmStudioModels.map((model: LocalModel) => (
                    <DropdownMenuItem
                      key={`lmstudio-${model.modelName}`}
                      className={
                        selectedModel.provider === "lmstudio" &&
                        selectedModel.name === model.modelName
                          ? "bg-secondary"
                          : ""
                      }
                      onClick={() => {
                        onModelSelect({
                          name: model.modelName,
                          provider: "lmstudio",
                        });
                        setOpen(false);
                      }}
                      dir={dir}
                    >
                      <div className="flex flex-col">
                        {/* Display the user-friendly name */}
                        <span dir={dir}>{model.displayName}</span>
                        {/* Show the path as secondary info */}
                        <span
                          className="text-xs text-muted-foreground truncate"
                          dir={dir}
                        >
                          {model.modelName}
                        </span>
                      </div>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
