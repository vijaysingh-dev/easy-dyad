import { getLanguageModels } from "@/services/llm/language_model_helpers";
import { LargeLanguageModel } from "@/shared/schemas";
import { LanguageModel } from "@/shared/eeziTypes";

export async function findLanguageModel(
  model: LargeLanguageModel
): Promise<LanguageModel | undefined> {
  const models = await getLanguageModels({
    providerId: model.provider,
  });

  if (model.customModelId) {
    const customModel = models.find(
      (m) => m.type === "custom" && m.id === model.customModelId
    );
    if (customModel) {
      return customModel;
    }
  }

  return models.find((m) => m.apiName === model.name);
}
