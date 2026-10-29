import test from "node:test";
import assert from "node:assert/strict";
import {
  AVAILABLE_MODELS,
  getAvailableModels,
  getDefaultModelId,
  getModelDefinition,
  resolveDirectModelId,
  resolveOpenRouterModelId,
} from "../lib/models.ts";
import {
  isOpenRouterConfigured,
  geocodeWithOpenRouter,
} from "../lib/providers/openrouter.ts";
import { buildProviderResult } from "../lib/providers/base.ts";
import { calculateJobSummary } from "../lib/geo.ts";
import { GeocodingResultEntry } from "../lib/types.ts";

test("Model registry provides available models with direct and OpenRouter IDs", () => {
  assert.ok(AVAILABLE_MODELS["google-gemini"]);
  const geminiModels = getAvailableModels("google-gemini");
  assert.equal(geminiModels.length, 10, "Should have 10 Gemini models");
  assert.equal(geminiModels[0].id, "gemini-4-argon");

  const geminiDef = getModelDefinition("google-gemini", "gemini-3.8-flash");
  assert.equal(geminiDef?.openRouterModelId, "google/gemini-3.8-flash");

  const openaiModels = getAvailableModels("openai");
  assert.equal(openaiModels.length, 10, "Should have 10 OpenAI models");
  assert.equal(openaiModels[0].id, "gpt-6.1-sol-pro");

  const anthropicModels = getAvailableModels("anthropic");
  assert.equal(anthropicModels.length, 10, "Should have 10 Anthropic models");
  assert.equal(anthropicModels[0].id, "claude-haiku-5.5");

  const lmStudioModels = getAvailableModels("lm-studio");
  assert.equal(lmStudioModels.length, 3, "Should have exactly the 3 local LM Studio models");
  assert.deepEqual(
    lmStudioModels.map((m) => m.label),
    ["Qwen3.6 27B", "Gemma 3 27B", "Qwen2.5 Coder 32B"]
  );
  assert.equal(getDefaultModelId("lm-studio"), "qwen3.6-27b");
});

test("Model resolution maps properly between direct API and OpenRouter identifiers", () => {
  // Direct model ID resolution
  assert.equal(resolveDirectModelId("google-gemini", "gemini-3.8-flash"), "gemini-3.8-flash");
  assert.equal(resolveDirectModelId("openai", "gpt-6.1-sol-pro"), "gpt-6.1-sol-pro");
  assert.equal(resolveDirectModelId("anthropic", "claude-haiku-5.5"), "claude-haiku-5.5");
  assert.equal(resolveDirectModelId("lm-studio", "qwen3.6-27b"), "qwen3.6-27b");

  // Fallback to default if empty
  assert.equal(resolveDirectModelId("google-gemini"), "gemini-4-argon");

  // OpenRouter model ID resolution
  assert.equal(
    resolveOpenRouterModelId("google-gemini", "gemini-3.8-flash"),
    "google/gemini-3.8-flash"
  );
  assert.equal(resolveOpenRouterModelId("openai", "gpt-6.1-sol-pro"), "openai/gpt-6.1-sol-pro");
  assert.equal(
    resolveOpenRouterModelId("anthropic", "claude-haiku-5.5"),
    "anthropic/claude-haiku-5.5"
  );

  // If already prefixed, keep as is
  assert.equal(
    resolveOpenRouterModelId("openai", "openai/gpt-4o-mini"),
    "openai/gpt-4o-mini"
  );
});

test("isOpenRouterConfigured correctly validates presence of OPENROUTER_API_KEY", () => {
  const originalKey = process.env.OPENROUTER_API_KEY;

  delete process.env.OPENROUTER_API_KEY;
  assert.equal(isOpenRouterConfigured(), false);

  process.env.OPENROUTER_API_KEY = "your_openrouter_key";
  assert.equal(isOpenRouterConfigured(), false);

  process.env.OPENROUTER_API_KEY = "sk-or-v1-abcdef123456";
  assert.equal(isOpenRouterConfigured(), true);

  if (originalKey !== undefined) {
    process.env.OPENROUTER_API_KEY = originalKey;
  } else {
    delete process.env.OPENROUTER_API_KEY;
  }
});

test("geocodeWithOpenRouter returns clear error when OPENROUTER_API_KEY is not configured", async () => {
  const originalKey = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;

  const result = await geocodeWithOpenRouter(
    "google-gemini",
    "gemini-2.5-flash",
    "San Jose, Costa Rica"
  );

  assert.equal(result.provider, "google-gemini");
  assert.equal(result.model, "gemini-2.5-flash");
  assert.equal(result.aggregator, "openrouter");
  assert.equal(result.result, null);
  assert.ok(result.error?.includes("OPENROUTER_API_KEY is not configured"));

  if (originalKey !== undefined) {
    process.env.OPENROUTER_API_KEY = originalKey;
  } else {
    delete process.env.OPENROUTER_API_KEY;
  }
});

test("geocodeWithOpenRouter handles successful response and computes distance accurately", async () => {
  const originalKey = process.env.OPENROUTER_API_KEY;
  const originalFetch = globalThis.fetch;

  process.env.OPENROUTER_API_KEY = "sk-or-v1-testkey";

  // Mock global fetch for OpenRouter API
  globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(url.toString(), "https://openrouter.ai/api/v1/chat/completions");
    const headers = init?.headers as Record<string, string>;
    assert.equal(headers["Authorization"], "Bearer sk-or-v1-testkey");

    const body = JSON.parse(init?.body as string);
    assert.equal(body.model, "openai/gpt-4o");

    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                pos: { lat: 9.9333, lng: -84.0833 },
              }),
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    const expected = { lat: 9.9333, lng: -84.0833 };
    const result = await geocodeWithOpenRouter(
      "openai",
      "gpt-4o",
      "Catedral, San Jose, Costa Rica",
      expected
    );

    assert.equal(result.provider, "openai");
    assert.equal(result.model, "gpt-4o");
    assert.equal(result.aggregator, "openrouter");
    assert.deepEqual(result.result, { lat: 9.9333, lng: -84.0833 });
    assert.equal(result.distanceMeters, 0);
    assert.equal(result.formattedDistance, "0 m");
    assert.equal(result.error, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey !== undefined) {
      process.env.OPENROUTER_API_KEY = originalKey;
    } else {
      delete process.env.OPENROUTER_API_KEY;
    }
  }
});

test("geocodeWithOpenRouter handles HTTP error from aggregator", async () => {
  const originalKey = process.env.OPENROUTER_API_KEY;
  const originalFetch = globalThis.fetch;

  process.env.OPENROUTER_API_KEY = "sk-or-v1-testkey";

  globalThis.fetch = async () => {
    return new Response(
      JSON.stringify({
        error: { message: "Provider rate limit exceeded or balance empty" },
      }),
      { status: 429, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    const result = await geocodeWithOpenRouter(
      "anthropic",
      "claude-3-7-sonnet",
      "Alajuela, Costa Rica"
    );

    assert.equal(result.provider, "anthropic");
    assert.equal(result.model, "claude-3-7-sonnet");
    assert.equal(result.aggregator, "openrouter");
    assert.equal(result.result, null);
    assert.ok(result.error?.includes("OpenRouter"));
    assert.ok(result.error?.includes("429"));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey !== undefined) {
      process.env.OPENROUTER_API_KEY = originalKey;
    } else {
      delete process.env.OPENROUTER_API_KEY;
    }
  }
});

test("ProviderResult aggregator field does not interfere with calculateJobSummary", () => {
  const entries: GeocodingResultEntry[] = [
    {
      input: "Address 1",
      expectedResult: { lat: 9.93, lng: -84.08 },
      providersResults: [
        {
          provider: "google-gemini",
          model: "gemini-2.5-flash",
          aggregator: "openrouter",
          result: { lat: 9.9305, lng: -84.0805 },
          durationMs: 250,
          distanceMeters: 75,
        },
        {
          provider: "openai",
          model: "gpt-4o",
          aggregator: "direct",
          result: { lat: 9.9302, lng: -84.0802 },
          durationMs: 300,
          distanceMeters: 30,
        },
      ],
    },
    {
      input: "Address 2",
      expectedResult: { lat: 9.95, lng: -84.1 },
      providersResults: [
        {
          provider: "google-gemini",
          model: "gemini-2.5-flash",
          aggregator: "openrouter",
          result: { lat: 9.9501, lng: -84.1001 },
          durationMs: 220,
          distanceMeters: 15,
        },
        {
          provider: "openai",
          model: "gpt-4o",
          aggregator: "direct",
          result: { lat: 9.9505, lng: -84.1005 },
          durationMs: 310,
          distanceMeters: 60,
        },
      ],
    },
  ];

  const summary = calculateJobSummary(entries, ["google-gemini", "openai"], 600);

  // Both providers should be calculated under their canonical provider IDs
  assert.ok(summary.providers["google-gemini"]);
  assert.ok(summary.providers["openai"]);
  assert.equal(summary.providers["google-gemini"].total, 2);
  assert.equal(summary.providers["google-gemini"].success, 2);
  assert.equal(summary.providers["google-gemini"].avgDistanceMeters, 45); // (75 + 15) / 2
  assert.equal(summary.providers["openai"].total, 2);
  assert.equal(summary.providers["openai"].avgDistanceMeters, 45); // (30 + 60) / 2
});

test("buildProviderResult correctly sets aggregator metadata field", () => {
  const res = buildProviderResult(
    "openai",
    { lat: 9.93, lng: -84.08 },
    120,
    { lat: 9.93, lng: -84.08 },
    undefined,
    "gpt-4o",
    "openrouter"
  );

  assert.equal(res.provider, "openai");
  assert.equal(res.model, "gpt-4o");
  assert.equal(res.aggregator, "openrouter");
  assert.equal(res.distanceMeters, 0);
});

test("getAvailableModels sets .env model as default selection in dropdown catalog", () => {
  const prevEnv = process.env.GOOGLE_GEMINI_MODEL;
  try {
    process.env.GOOGLE_GEMINI_MODEL = "gemini-3.7-flash";
    const models = getAvailableModels("google-gemini");
    const defaultModel = models.find((m) => m.isDefault);
    assert.ok(defaultModel, "Should have a default model");
    assert.equal(defaultModel.id, "gemini-3.7-flash");

    // Other models should still be present in the dropdown list
    assert.ok(models.some((m) => m.id === "gemini-4-argon" && !m.isDefault));
    assert.ok(models.some((m) => m.id === "gemini-3.8-flash" && !m.isDefault));
  } finally {
    if (prevEnv !== undefined) {
      process.env.GOOGLE_GEMINI_MODEL = prevEnv;
    } else {
      delete process.env.GOOGLE_GEMINI_MODEL;
    }
  }
});

test("getAvailableModels handles custom .env model without recursion and prefixes OpenRouter ID", () => {
  const prevEnv = process.env.GOOGLE_GEMINI_MODEL;
  try {
    process.env.GOOGLE_GEMINI_MODEL = "gemini-custom-future";
    const models = getAvailableModels("google-gemini");
    const defaultModel = models.find((m) => m.isDefault);
    assert.ok(defaultModel, "Should have a default model");
    assert.equal(defaultModel.id, "gemini-custom-future");
    assert.equal(defaultModel.openRouterModelId, "google/gemini-custom-future");
    assert.equal(defaultModel.directModelId, "gemini-custom-future");
    assert.equal(defaultModel.isDefault, true);

    // Standard catalog models are also present
    assert.ok(models.length > AVAILABLE_MODELS["google-gemini"].length);
  } finally {
    if (prevEnv !== undefined) {
      process.env.GOOGLE_GEMINI_MODEL = prevEnv;
    } else {
      delete process.env.GOOGLE_GEMINI_MODEL;
    }
  }
});

test("Nvidia provider model definition and resolution", () => {
  const models = getAvailableModels("nvidia");
  assert.equal(models.length, 1);
  assert.equal(models[0].id, "nvidia/nemotron-3-ultra-550b-a55b:free");
  assert.equal(models[0].openRouterModelId, "nvidia/nemotron-3-ultra-550b-a55b:free");
  assert.equal(models[0].directModelId, "nvidia/nemotron-3-ultra-550b-a55b:free");
  assert.equal(models[0].isDefault, true);

  assert.equal(
    getDefaultModelId("nvidia"),
    "nvidia/nemotron-3-ultra-550b-a55b:free"
  );
  assert.equal(
    resolveOpenRouterModelId("nvidia", "nvidia/nemotron-3-ultra-550b-a55b:free"),
    "nvidia/nemotron-3-ultra-550b-a55b:free"
  );
});

test("NvidiaProvider is configured via OpenRouter and routes through OpenRouter", async () => {
  const { NvidiaProvider } = await import("../lib/providers/nvidia.ts");
  const provider = new NvidiaProvider();

  assert.equal(provider.id, "nvidia");
  assert.equal(provider.name, "Nvidia");
  assert.equal(provider.type, "llm");
  assert.equal(provider.model, "nvidia/nemotron-3-ultra-550b-a55b:free");

  const origKey = process.env.OPENROUTER_API_KEY;
  try {
    delete process.env.OPENROUTER_API_KEY;
    assert.equal(provider.isConfigured(), false);
    const unconfigStatus = provider.getConfigStatus();
    assert.equal(unconfigStatus.isConfigured, false);
    assert.deepEqual(unconfigStatus.missingEnvVars, ["OPENROUTER_API_KEY"]);

    // Attempting geocode without key returns error with aggregator: openrouter
    const res = await provider.geocode("San Jose, Costa Rica");
    assert.equal(res.provider, "nvidia");
    assert.equal(res.aggregator, "openrouter");
    assert.ok(res.error?.includes("OPENROUTER_API_KEY"));

    process.env.OPENROUTER_API_KEY = "sk-or-v1-validkey";
    assert.equal(provider.isConfigured(), true);
    assert.equal(provider.getConfigStatus().isConfigured, true);
  } finally {
    if (origKey !== undefined) {
      process.env.OPENROUTER_API_KEY = origKey;
    } else {
      delete process.env.OPENROUTER_API_KEY;
    }
  }
});


