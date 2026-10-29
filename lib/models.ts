export interface ModelDefinition {
  id: string;
  label: string;
  openRouterModelId: string;
  directModelId: string;
  description?: string;
  isDefault?: boolean;
}

export const AVAILABLE_MODELS: Record<string, ModelDefinition[]> = {
  "google-gemini": [
    {
      id: "gemini-4-argon",
      label: "Gemini 4 Argon",
      openRouterModelId: "google/gemini-4-argon",
      directModelId: "gemini-4-argon",
      description: "Next-gen flagship reasoning model",
      isDefault: true,
    },
    {
      id: "gemini-3.8-flash",
      label: "Gemini 3.8 Flash",
      openRouterModelId: "google/gemini-3.8-flash",
      directModelId: "gemini-3.8-flash",
      description: "High-throughput, ultra-fast production model",
    },
    {
      id: "gemini-3.7-flash",
      label: "Gemini 3.7 Flash",
      openRouterModelId: "google/gemini-3.7-flash",
      directModelId: "gemini-3.7-flash",
      description: "Hybrid reasoning and multimodal model",
    },
    {
      id: "gemini-3.6-flash",
      label: "Gemini 3.6 Flash",
      openRouterModelId: "google/gemini-3.6-flash",
      directModelId: "gemini-3.6-flash",
      description: "High-efficiency low-latency model",
    },
    {
      id: "gemini-3.5-flash-lite",
      label: "Gemini 3.5 Flash Lite",
      openRouterModelId: "google/gemini-3.5-flash-lite",
      directModelId: "gemini-3.5-flash-lite",
      description: "Lightweight cost-optimized model",
    },
    {
      id: "gemini-3.5-flash",
      label: "Gemini 3.5 Flash",
      openRouterModelId: "google/gemini-3.5-flash",
      directModelId: "gemini-3.5-flash",
      description: "Balanced reasoning and high speed",
    },
    {
      id: "gemini-3.1-flash-lite",
      label: "Gemini 3.1 Flash Lite",
      openRouterModelId: "google/gemini-3.1-flash-lite",
      directModelId: "gemini-3.1-flash-lite",
      description: "Fast lightweight flash model",
    },
    {
      id: "gemini-3.1-pro-preview",
      label: "Gemini 3.1 Pro Preview",
      openRouterModelId: "google/gemini-3.1-pro-preview",
      directModelId: "gemini-3.1-pro-preview",
      description: "Advanced deliberation and reasoning",
    },
    {
      id: "gemini-2.5-flash",
      label: "Gemini 2.5 Flash",
      openRouterModelId: "google/gemini-2.5-flash",
      directModelId: "gemini-2.5-flash",
      description: "Multimodal high-rate flash model",
    },
    {
      id: "gemini-2.5-pro",
      label: "Gemini 2.5 Pro",
      openRouterModelId: "google/gemini-2.5-pro",
      directModelId: "gemini-2.5-pro",
      description: "Deep thinking and complex analysis",
    },
  ],
  "openai": [
    {
      id: "gpt-6.1-sol-pro",
      label: "GPT-6.1 Sol Pro",
      openRouterModelId: "openai/gpt-6.1-sol-pro",
      directModelId: "gpt-6.1-sol-pro",
      description: "Next-gen premier reasoning model",
      isDefault: true,
    },
    {
      id: "gpt-6.1-sol",
      label: "GPT-6.1 Sol",
      openRouterModelId: "openai/gpt-6.1-sol",
      directModelId: "gpt-6.1-sol",
      description: "High-capability flagship model",
    },
    {
      id: "gpt-6-luna-pro",
      label: "GPT-6 Luna Pro",
      openRouterModelId: "openai/gpt-6-luna-pro",
      directModelId: "gpt-6-luna-pro",
      description: "Deliberative reasoning specialist",
    },
    {
      id: "gpt-6-luna",
      label: "GPT-6 Luna",
      openRouterModelId: "openai/gpt-6-luna",
      directModelId: "gpt-6-luna",
      description: "Fast high-reasoning model",
    },
    {
      id: "gpt-6-sol-pro",
      label: "GPT-6 Sol Pro",
      openRouterModelId: "openai/gpt-6-sol-pro",
      directModelId: "gpt-6-sol-pro",
      description: "Advanced intelligence pro model",
    },
    {
      id: "gpt-6-sol",
      label: "GPT-6 Sol",
      openRouterModelId: "openai/gpt-6-sol",
      directModelId: "gpt-6-sol",
      description: "Standard generation 6 model",
    },
    {
      id: "gpt-6-astra",
      label: "GPT-6 Astra",
      openRouterModelId: "openai/gpt-6-astra",
      directModelId: "gpt-6-astra",
      description: "Ultra-fast high-efficiency model",
    },
    {
      id: "gpt-6-astra-pro",
      label: "GPT-6 Astra Pro",
      openRouterModelId: "openai/gpt-6-astra-pro",
      directModelId: "gpt-6-astra-pro",
      description: "High-throughput Astra series model",
    },
    {
      id: "gpt-5.6-luna-pro",
      label: "GPT-5.6 Luna Pro",
      openRouterModelId: "openai/gpt-5.6-luna-pro",
      directModelId: "gpt-5.6-luna-pro",
      description: "High-intelligence reasoning model",
    },
    {
      id: "gpt-5.6-luna",
      label: "GPT-5.6 Luna",
      openRouterModelId: "openai/gpt-5.6-luna",
      directModelId: "gpt-5.6-luna",
      description: "Balanced reasoning and latency model",
    },
  ],
  "anthropic": [
    {
      id: "claude-haiku-5.5",
      label: "Claude Haiku 5.5",
      openRouterModelId: "anthropic/claude-haiku-5.5",
      directModelId: "claude-haiku-5.5",
      description: "Fastest generation 5.5 model",
      isDefault: true,
    },
    {
      id: "claude-sonnet-5.5",
      label: "Claude Sonnet 5.5",
      openRouterModelId: "anthropic/claude-sonnet-5.5",
      directModelId: "claude-sonnet-5.5",
      description: "State-of-the-art hybrid reasoning model",
    },
    {
      id: "claude-opus-5.5",
      label: "Claude Opus 5.5",
      openRouterModelId: "anthropic/claude-opus-5.5",
      directModelId: "claude-opus-5.5",
      description: "Top-tier complex reasoning and analysis",
    },
    {
      id: "claude-fable-5.1",
      label: "Claude Fable 5.1",
      openRouterModelId: "anthropic/claude-fable-5.1",
      directModelId: "claude-fable-5.1",
      description: "Creative and instructional reasoning model",
    },
    {
      id: "claude-opus-5",
      label: "Claude Opus 5",
      openRouterModelId: "anthropic/claude-opus-5",
      directModelId: "claude-opus-5",
      description: "High intelligence generation 5 flagship",
    },
    {
      id: "claude-sonnet-5",
      label: "Claude Sonnet 5",
      openRouterModelId: "anthropic/claude-sonnet-5",
      directModelId: "claude-sonnet-5",
      description: "Versatile workhorse generation 5 model",
    },
    {
      id: "claude-fable-5",
      label: "Claude Fable 5",
      openRouterModelId: "anthropic/claude-fable-5",
      directModelId: "claude-fable-5",
      description: "Generation 5 instructional model",
    },
    {
      id: "claude-opus-4.8",
      label: "Claude Opus 4.8",
      openRouterModelId: "anthropic/claude-opus-4.8",
      directModelId: "claude-opus-4.8",
      description: "Deep analysis generation 4 model",
    },
    {
      id: "claude-opus-4.7",
      label: "Claude Opus 4.7",
      openRouterModelId: "anthropic/claude-opus-4.7",
      directModelId: "claude-opus-4.7",
      description: "Advanced deliberative generation 4 model",
    },
    {
      id: "claude-sonnet-4.6",
      label: "Claude Sonnet 4.6",
      openRouterModelId: "anthropic/claude-sonnet-4.6",
      directModelId: "claude-sonnet-4.6",
      description: "High-capability generation 4 model",
    },
  ],
  "lm-studio": [
    {
      id: "qwen3.6-27b",
      label: "Qwen3.6 27B",
      openRouterModelId: "qwen/qwen3.6-27b",
      directModelId: "qwen3.6-27b",
      description: "Local Qwen3.6 27B model",
      isDefault: true,
    },
    {
      id: "gemma-3-27b",
      label: "Gemma 3 27B",
      openRouterModelId: "google/gemma-3-27b",
      directModelId: "gemma-3-27b",
      description: "Local Gemma 3 27B model",
    },
    {
      id: "qwen2.5-coder-32b",
      label: "Qwen2.5 Coder 32B",
      openRouterModelId: "qwen/qwen-2.5-coder-32b",
      directModelId: "qwen2.5-coder-32b",
      description: "Local Qwen2.5 Coder 32B model",
    },
  ],
  "nvidia": [
    {
      id: "nvidia/nemotron-3-ultra-550b-a55b:free",
      label: "Nemotron 3 Ultra 550B (free)",
      openRouterModelId: "nvidia/nemotron-3-ultra-550b-a55b:free",
      directModelId: "nvidia/nemotron-3-ultra-550b-a55b:free",
      description: "Nvidia Nemotron 3 Ultra 550B free model via OpenRouter",
      isDefault: true,
    },
  ],
};

/**
 * Returns the configured environment variable model name for a provider, if present.
 */
export function getEnvModel(providerId: string): string | undefined {
  if (providerId === "google-gemini") return process.env.GOOGLE_GEMINI_MODEL?.trim();
  if (providerId === "openai") return process.env.OPENAI_MODEL?.trim();
  if (providerId === "anthropic") return process.env.ANTHROPIC_MODEL?.trim();
  if (providerId === "lm-studio") return process.env.LM_STUDIO_MODEL?.trim();
  if (providerId === "nvidia") return process.env.NVIDIA_MODEL?.trim();
  return undefined;
}

function formatOpenRouterPrefix(providerId: string, modelId: string): string {
  const clean = modelId.trim();
  if (clean.includes("/")) return clean;
  if (providerId === "google-gemini") return `google/${clean}`;
  if (providerId === "openai") return `openai/${clean}`;
  if (providerId === "anthropic") return `anthropic/${clean}`;
  if (providerId === "nvidia") return `nvidia/${clean}`;
  return clean;
}

/**
 * Returns available models for a given provider id, with the .env model set as default.
 */
export function getAvailableModels(providerId: string): ModelDefinition[] {
  const base = AVAILABLE_MODELS[providerId] || [];
  const envModel = getEnvModel(providerId);

  if (!envModel) {
    return base.map((m) => ({ ...m }));
  }

  const cleanEnv = envModel.toLowerCase();
  const matchedIdx = base.findIndex(
    (m) =>
      m.id.toLowerCase() === cleanEnv ||
      m.directModelId.toLowerCase() === cleanEnv ||
      m.openRouterModelId.toLowerCase() === cleanEnv
  );

  if (matchedIdx >= 0) {
    return base.map((m, idx) => ({
      ...m,
      isDefault: idx === matchedIdx,
    }));
  }

  // If envModel is a custom model not in the static list, include it as the default
  const customModel: ModelDefinition = {
    id: envModel,
    label: envModel,
    openRouterModelId: formatOpenRouterPrefix(providerId, envModel),
    directModelId: envModel,
    description: "Configured model",
    isDefault: true,
  };

  return [customModel, ...base.map((m) => ({ ...m, isDefault: false }))];
}

/**
 * Returns default model ID for a provider (derived from .env or catalog default).
 */
export function getDefaultModelId(providerId: string): string {
  const models = getAvailableModels(providerId);
  const def = models.find((m) => m.isDefault);
  if (def) return def.id;
  if (models.length > 0) return models[0].id;
  return "";
}

/**
 * Finds model definition for a given provider and model ID.
 */
export function getModelDefinition(providerId: string, modelId: string): ModelDefinition | undefined {
  const models = getAvailableModels(providerId);
  const clean = modelId.trim().toLowerCase();
  return models.find(
    (m) =>
      m.id.toLowerCase() === clean ||
      m.openRouterModelId.toLowerCase() === clean ||
      m.directModelId.toLowerCase() === clean
  );
}

/**
 * Resolves the direct API model name to send to the provider's direct endpoint.
 */
export function resolveDirectModelId(providerId: string, modelId?: string): string {
  if (!modelId || !modelId.trim()) {
    return getDefaultModelId(providerId);
  }
  const clean = modelId.trim();
  const def = getModelDefinition(providerId, clean);
  if (def) return def.directModelId;

  // Fallback: if user specified a raw model ID
  return clean;
}

/**
 * Resolves the OpenRouter model identifier (e.g. google/gemini-2.5-flash).
 */
export function resolveOpenRouterModelId(providerId: string, modelId?: string): string {
  const clean = (modelId || "").trim();
  if (!clean) {
    const def = getModelDefinition(providerId, getDefaultModelId(providerId));
    if (def) return def.openRouterModelId;
  }
  const def = getModelDefinition(providerId, clean);
  if (def) return def.openRouterModelId;

  return formatOpenRouterPrefix(providerId, clean);
}
