import { AxiosRequestConfig } from "axios";
import {
  CreateCustomLanguageModelParams,
  CreateCustomLanguageModelProviderParams,
  DeleteCustomModelParams,
} from "@shared/eeziTypes";
import Api from "./api";

class LLMApiService {
  public async listLocalOllamaModels() {
    const { data } = await Api.get("/llm/local-models/list-ollama");
    return data?.models || [];
  }

  public async listLocalLMStudioModels() {
    const { data } = await Api.get("/llm/local-models/list-lmstudio");
    return data?.models || [];
  }

  // --- Language Model Providers ---
  public async getLanguageModelProviders() {
    const { data } = await Api.get("/llm/get-language-model-providers");
    return data;
  }

  public async getLanguageModels(params: { providerId: string }) {
    const config: AxiosRequestConfig = { params };
    const { data } = await Api.get("/llm/get-language-models", { config });
    return data;
  }

  public async getLanguageModelsByProviders() {
    const { data } = await Api.get("/llm/get-language-models-by-providers");
    return data;
  }

  public async createCustomLanguageModelProvider({
    id,
    name,
    apiBaseUrl,
    envVarName,
  }: CreateCustomLanguageModelProviderParams) {
    const { data } = await Api.post("/llm/create-custom-language-model-provider", {
      id,
      name,
      apiBaseUrl,
      envVarName,
    });
    return data;
  }

  public async editCustomLanguageModelProvider(
    params: CreateCustomLanguageModelProviderParams
  ) {
    const { data } = await Api.patch("/llm/edit-custom-language-model-provider", params);
    return data;
  }

  public async createCustomLanguageModel(params: CreateCustomLanguageModelParams) {
    const { data } = await Api.post("/llm/create-custom-language-model", params);
    return data;
  }

  public async deleteCustomLanguageModel(modelId: string) {
    const { data } = await Api.delete(`/llm/delete-custom-language-model/${modelId}`);
    return data;
  }

  async deleteCustomModel(params: DeleteCustomModelParams) {
    const config: AxiosRequestConfig = { params };
    const { data } = await Api.delete("/llm/delete-custom-model", { config });
    return data;
    ``;
  }

  async deleteCustomLanguageModelProvider(providerId: string) {
    const { data } = await Api.delete(
      `/llm/delete-custom-language-model-provider/${providerId}`
    );
    return data;
  }
  // --- End Language Model Providers ---
}

const llmApi = new LLMApiService();
export default llmApi;
