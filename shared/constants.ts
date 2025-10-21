export const MAX_CHAT_TURNS_IN_CONTEXT = 3;

export const TURBO_MODELS: LanguageModel[] = [
  {
    apiName: "qwen3-coder:turbo",
    displayName: "Qwen3 Coder",
    description: "Qwen's best coding model (very fast)",
    maxOutputTokens: 32_000,
    contextWindow: 131_000,
    temperature: 0,
    dollarSigns: 2,
    type: "cloud",
  },
  {
    apiName: "kimi-k2:turbo",
    displayName: "Kimi K2",
    description: "Kimi 0905 update (fast)",
    maxOutputTokens: 16_000,
    contextWindow: 256_000,
    temperature: 0,
    dollarSigns: 2,
    type: "cloud",
  },
];
