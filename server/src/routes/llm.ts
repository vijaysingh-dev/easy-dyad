import logger from "@/logger";
import db from "@/db";
import {
  language_models,
  language_model_providers as languageModelProvidersSchema,
  language_models as languageModelsSchema,
} from "@/db/schema";
import { Router } from "express";
import { and, eq } from "drizzle-orm";
import {
  CUSTOM_PROVIDER_PREFIX,
  getLanguageModelProviders,
  getLanguageModels,
  getLanguageModelsByProviders,
} from "@/services/llm/language_model_helpers";
import { getOllamaApiUrl, LM_STUDIO_BASE_URL } from "@/utils/misc_utils";
import { LocalModel, OllamaModel, LMStudioModel } from "@shared/eeziTypes";

const router = Router();

router.get("/local-models/list-ollama", async (req, res) => {
  try {
    const response = await fetch(`${getOllamaApiUrl()}/api/tags`);
    if (!response.ok) {
      throw new Error(`Failed to fetch model: ${response.statusText}`);
    }

    const data = await response.json();
    const ollamaModels: OllamaModel[] = data.models || [];

    const models: LocalModel[] = ollamaModels.map((model: OllamaModel) => {
      const displayName = model.name
        .split(":")[0]
        .replace(/-/g, " ")
        .replace(/(\d+)/, " $1 ")
        .split(" ")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ")
        .trim();

      return {
        modelName: model.name,
        displayName,
        provider: "ollama",
      };
    });
    logger.info(`Successfully fetched ${models.length} models from Ollama`);
    res.json({ models });
  } catch (error) {
    logger.error("Error fetching local Ollama models:", error);
    res.status(500).json({ error: "Failed to fetch local Ollama models" });
  }
});
router.get("/local-models/list-lmstudio", async (req, res) => {
  try {
    const modelsResponse: Response = await fetch(`${LM_STUDIO_BASE_URL}/api/v0/models`);
    if (!modelsResponse.ok) {
      throw new Error("Failed to fetch models from LM Studio");
    }
    const modelsJson = await modelsResponse.json();
    const downloadedModels = modelsJson.data as LMStudioModel[];
    const models: LocalModel[] = downloadedModels
      .filter((model: any) => model.type === "llm")
      .map((model: any) => ({
        modelName: model.id,
        displayName: model.id,
        provider: "lmstudio",
      }));

    logger.info(`Successfully fetched ${models.length} models from LM Studio`);
    res.json({ models });
  } catch (error) {
    logger.error("Error fetching local LMStudio models:", error);
    res.status(500).json({ error: "Failed to fetch local LMStudio models" });
  }
});

// --- Language Model Provider Routes ---
router.get("/get-language-model-providers", async (req, res) => {
  try {
    const providers = await getLanguageModelProviders();
    res.json(providers);
  } catch (error) {
    logger.error("Error fetching language model providers:", error);
    res.status(500).json({ error: "Failed to fetch language model providers" });
  }
});

router.post("/create-custom-language-model-provider", async (req, res) => {
  try {
    const { id, name, apiBaseUrl, envVarName } = req.body;

    // Validation
    if (!id) {
      throw new Error("Provider ID is required");
    }

    if (!name) {
      throw new Error("Provider name is required");
    }

    if (!apiBaseUrl) {
      throw new Error("API base URL is required");
    }

    // Check if a provider with this ID already exists
    const existingProvider = db
      .select()
      .from(languageModelProvidersSchema)
      .where(eq(languageModelProvidersSchema.id, id))
      .get();

    if (existingProvider) {
      throw new Error(`A provider with ID "${id}" already exists`);
    }

    // Insert the new provider
    await db.insert(languageModelProvidersSchema).values({
      // Make sure we will never have accidental collisions with builtin providers
      id: CUSTOM_PROVIDER_PREFIX + id,
      name,
      api_base_url: apiBaseUrl,
      env_var_name: envVarName || null,
    });

    // Return the newly created provider
    res.json({
      id,
      name,
      apiBaseUrl,
      envVarName,
      type: "custom",
    });
  } catch (error) {
    logger.error("Error creating custom language model provider:", error);
    res.status(500).json({ error: "Failed to create custom language model provider" });
  }
});

router.post("/create-custom-language-model", async (req, res) => {
  try {
    const {
      apiName,
      displayName,
      providerId,
      description,
      maxOutputTokens,
      contextWindow,
    } = req.body;

    // Validation
    if (!apiName) {
      throw new Error("Model API name is required");
    }
    if (!displayName) {
      throw new Error("Model display name is required");
    }
    if (!providerId) {
      throw new Error("Provider ID is required");
    }

    // Check if provider exists
    const providers = await getLanguageModelProviders();
    const provider = providers.find((p) => p.id === providerId);
    if (!provider) {
      throw new Error(`Provider with ID "${providerId}" not found`);
    }

    // Insert the new model
    await db.insert(languageModelsSchema).values({
      displayName,
      apiName,
      builtinProviderId: provider.type === "cloud" ? providerId : undefined,
      customProviderId: provider.type === "custom" ? providerId : undefined,
      description: description || null,
      max_output_tokens: maxOutputTokens || null,
      context_window: contextWindow || null,
    });
    res.json({ success: true });
  } catch (error) {
    logger.error("Error creating custom language model:", error);
    res.status(500).json({ error: "Failed to create custom language model" });
  }
});

router.patch("/edit-custom-language-model-provider", async (req, res) => {
  try {
    const { id, name, apiBaseUrl, envVarName } = req.body;

    if (!id) {
      throw new Error("Provider ID is required");
    }
    if (!name) {
      throw new Error("Provider name is required");
    }
    if (!apiBaseUrl) {
      throw new Error("API base URL is required");
    }

    // Check if the provider being edited exists
    const existingProvider = db
      .select()
      .from(languageModelProvidersSchema)
      .where(eq(languageModelProvidersSchema.id, CUSTOM_PROVIDER_PREFIX + id))
      .get();

    if (!existingProvider) {
      throw new Error(`Provider with ID "${id}" not found`);
    }

    // Use transaction to ensure atomicity when updating provider and potentially its models
    const result = db.transaction((tx) => {
      // Update the provider
      const updateResult = tx
        .update(languageModelProvidersSchema)
        .set({
          id: CUSTOM_PROVIDER_PREFIX + id,
          name,
          api_base_url: apiBaseUrl,
          env_var_name: envVarName || null,
        })
        .where(eq(languageModelProvidersSchema.id, CUSTOM_PROVIDER_PREFIX + id))
        .run();

      if (updateResult.changes === 0) {
        throw new Error(`Failed to update provider with ID "${id}"`);
      }

      return {
        id,
        name,
        apiBaseUrl,
        envVarName,
        type: "custom" as const,
      };
    });
    logger.info(`Successfully updated provider`);
    res.json(result);
  } catch (error) {
    logger.error("Error editing custom language model provider:", error);
    res.status(500).json({ error: "Failed to edit custom language model provider" });
  }
});

router.delete("/delete-custom-language-model/:modelId", async (req, res) => {
  try {
    const { modelId: apiName } = req.params;
    // Validation
    if (!apiName) {
      throw new Error("Model API name (modelId) is required");
    }

    logger.info(`Handling delete-custom-language-model for apiName: ${apiName}`);

    const existingModel = await db
      .select()
      .from(languageModelsSchema)
      .where(eq(languageModelsSchema.apiName, apiName))
      .get();

    if (!existingModel) {
      throw new Error(`A model with API name (modelId) "${apiName}" was not found`);
    }

    await db
      .delete(languageModelsSchema)
      .where(eq(languageModelsSchema.apiName, apiName));
    res.json({ success: true });
  } catch (error) {
    logger.error("Error deleting custom language model:", error);
    res.status(500).json({ error: "Failed to delete custom language model" });
  }
});

router.delete("/delete-custom-model/:providerId", async (req, res) => {
  try {
    const { providerId, modelApiName } = req.query as {
      providerId: string;
      modelApiName: string;
    };

    logger.info(`Handling delete-custom-model for ${providerId} / ${modelApiName}`);
    if (!providerId || !modelApiName) {
      throw new Error("Provider ID and Model API Name are required.");
    }
    logger.info(
      `Attempting to delete custom model ${modelApiName} for provider ${providerId}`
    );

    const providers = await getLanguageModelProviders();
    const provider = providers.find((p) => p.id === providerId);
    if (!provider) {
      throw new Error(`Provider with ID "${providerId}" not found`);
    }
    if (provider.type === "local") {
      throw new Error("Local models cannot be deleted");
    }
    const result = db
      .delete(language_models)
      .where(
        and(
          provider.type === "cloud"
            ? eq(language_models.builtinProviderId, providerId)
            : eq(language_models.customProviderId, providerId),

          eq(language_models.apiName, modelApiName)
        )
      )
      .run();

    if (result.changes === 0) {
      logger.warn(
        `No custom model found matching providerId=${providerId} and apiName=${modelApiName} for deletion.`
      );
    } else {
      logger.info(
        `Successfully deleted ${result.changes} custom model(s) with apiName=${modelApiName} for provider=${providerId}`
      );
    }
    res.json(result);
  } catch (error) {
    logger.error("Error deleting custom model:", error);
    res.status(500).json({ error: "Failed to delete custom model" });
  }
});

router.delete("/delete-custom-language-model-provider/:providerId", async (req, res) => {
  try {
    const { providerId } = req.params;

    // Validation
    if (!providerId) {
      throw new Error("Provider ID is required");
    }

    logger.info(
      `Handling delete-custom-language-model-provider for providerId: ${providerId}`
    );

    // Check if the provider exists before attempting deletion
    const existingProvider = await db
      .select({ id: languageModelProvidersSchema.id })
      .from(languageModelProvidersSchema)
      .where(eq(languageModelProvidersSchema.id, providerId))
      .get();

    if (!existingProvider) {
      // If the provider doesn't exist, maybe it was already deleted. Log and return.
      logger.warn(
        `Provider with ID "${providerId}" not found. It might have been deleted already.`
      );
      // Optionally, throw new Error(`Provider with ID "${providerId}" not found`);
      // Deciding to return gracefully instead of throwing an error if not found.
      return;
    }

    // Use a transaction to ensure atomicity
    db.transaction((tx) => {
      // 1. Delete associated models
      const deleteModelsResult = tx
        .delete(languageModelsSchema)
        .where(eq(languageModelsSchema.customProviderId, providerId))
        .run();
      logger.info(
        `Deleted ${deleteModelsResult.changes} model(s) associated with provider ${providerId}`
      );

      // 2. Delete the provider
      const deleteProviderResult = tx
        .delete(languageModelProvidersSchema)
        .where(eq(languageModelProvidersSchema.id, providerId))
        .run();

      if (deleteProviderResult.changes === 0) {
        // This case should ideally not happen if existingProvider check passed,
        // but adding safety check within transaction.
        logger.error(
          `Failed to delete provider with ID "${providerId}" during transaction, although it was found initially. Rolling back.`
        );
        throw new Error(
          `Failed to delete provider with ID "${providerId}" which should have existed.`
        );
      }
      logger.info(`Successfully deleted provider with ID "${providerId}".`);
      res.json(deleteProviderResult);
    });
  } catch (error) {
    logger.error("Error deleting custom language model provider:", error);
    res.status(500).json({ error: "Failed to delete custom language model provider" });
  }
});

router.get("/get-language-models/", async (req, res) => {
  try {
    const { providerId } = req.query;
    if (!providerId || typeof providerId !== "string") {
      throw new Error("Invalid parameters: providerId (string) is required.");
    }
    const providers = await getLanguageModelProviders();
    const provider = providers.find((p) => p.id === providerId);
    if (!provider) {
      throw new Error(`Provider with ID "${providerId}" not found`);
    }
    if (provider.type === "local") {
      throw new Error("Local models cannot be fetched");
    }
    const result = getLanguageModels({ providerId });
    res.json(result);
  } catch (error) {
    logger.error("Error fetching language models by provider:", error);
    res.status(500).json({ error: "Failed to fetch language models by provider" });
  }
});

router.get("/get-language-models-by-providers", async (req, res) => {
  try {
    const result = await getLanguageModelsByProviders();
    res.json(result);
  } catch (error) {
    logger.error("Error fetching language models by providers:", error);
    res.status(500).json({ error: "Failed to fetch language models by providers" });
  }
});
// --- End Language Model Provider Routes ---

export default router;
