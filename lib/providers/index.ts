import { ProviderAdapter, ProviderConfigStatus } from "../types";
import { GoogleGeminiProvider } from "./google-gemini";
import { OpenAIProvider } from "./openai";
import { AnthropicProvider } from "./anthropic";
import { LMStudioProvider } from "./lm-studio";
import { NvidiaProvider } from "./nvidia";

const providers: Record<string, ProviderAdapter> = {
  "google-gemini": new GoogleGeminiProvider(),
  "openai": new OpenAIProvider(),
  "anthropic": new AnthropicProvider(),
  "lm-studio": new LMStudioProvider(),
  "nvidia": new NvidiaProvider(),
};

export function getProvider(id: string): ProviderAdapter | undefined {
  return providers[id];
}

export function getAllProviders(): ProviderAdapter[] {
  return Object.values(providers);
}

export function getProviderConfigStatuses(): ProviderConfigStatus[] {
  const meta: Record<string, { color: string; description: string }> = {
    "google-gemini": { color: "#3b82f6", description: "Gemini 3.6 Flash LLM geocoding" },
    "openai": { color: "#a855f7", description: "GPT-6-mini LLM geocoding" },
    "anthropic": { color: "#f97316", description: "Claude 5-Haiku LLM geocoding" },
    "lm-studio": { color: "#ef4444", description: "Local LLM via LM Studio" },
    "nvidia": { color: "#76b900", description: "Nemotron 3 Ultra via OpenRouter" },
  };

  return getAllProviders().map((p) => {
    const status = p.getConfigStatus();
    const m = meta[p.id] || { color: "#888888", description: "" };
    return {
      id: p.id,
      name: p.name,
      type: p.type,
      color: m.color,
      description: m.description,
      isConfigured: status.isConfigured,
      modelOrEndpoint: status.modelOrEndpoint,
      missingEnvVars: status.missingEnvVars,
    };
  });
}

export {
  GoogleGeminiProvider,
  OpenAIProvider,
  AnthropicProvider,
  LMStudioProvider,
  NvidiaProvider,
};

export { isOpenRouterConfigured, geocodeWithOpenRouter } from "./openrouter";
