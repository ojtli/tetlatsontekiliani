import { LatLng, ProviderResult } from "../types";
import { logger } from "../logger";
import { resolveOpenRouterModelId } from "../models";
import {
  buildProviderResult,
  parseGeocodingResponse,
} from "./base";
import {
  LLM_GEOCODING_SYSTEM_PROMPT_V1,
  LLM_GEOCODING_USER_PROMPT_V1,
} from "../prompts";


export function isOpenRouterConfigured(): boolean {
  const key = process.env.OPENROUTER_API_KEY;
  return Boolean(key && key.trim().length > 0 && !key.includes("your_"));
}

export async function geocodeWithOpenRouter(
  providerId: string,
  modelId: string,
  address: string,
  expected?: LatLng | null
): Promise<ProviderResult> {
  const start = performance.now();
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!isOpenRouterConfigured() || !apiKey) {
    return buildProviderResult(
      providerId,
      null,
      0,
      expected,
      "OPENROUTER_API_KEY is not configured in .env.local",
      modelId,
      "openrouter"
    );
  }

  const openRouterModel = resolveOpenRouterModelId(providerId, modelId);

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey.trim()}`,
        "HTTP-Referer": "http://localhost:3200",
        "X-Title": "Tico Address Benchmark",
      },
      body: JSON.stringify({
        model: openRouterModel,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: LLM_GEOCODING_SYSTEM_PROMPT_V1,
          },
          {
            role: "user",
            content: LLM_GEOCODING_USER_PROMPT_V1(address),
          },
        ],
      }),
      signal: AbortSignal.timeout(30000),
    });

    const durationMs = performance.now() - start;

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const msg = errorData?.error?.message || response.statusText;
      logger.logProviderResponse(
        providerId,
        address,
        durationMs,
        errorData,
        `OpenRouter HTTP ${response.status}`
      );
      return buildProviderResult(
        providerId,
        null,
        durationMs,
        expected,
        `OpenRouter (${openRouterModel}) error ${response.status}: ${msg}`,
        modelId,
        "openrouter"
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    logger.logProviderResponse(providerId, address, durationMs, content ?? data);

    if (!content) {
      return buildProviderResult(
        providerId,
        null,
        durationMs,
        expected,
        `OpenRouter (${openRouterModel}) returned no completion content`,
        modelId,
        "openrouter"
      );
    }

    const { coords, error } = parseGeocodingResponse(content);

    if (error) {
      return buildProviderResult(
        providerId,
        null,
        durationMs,
        expected,
        `OpenRouter (${openRouterModel}) parse error: ${error}`,
        modelId,
        "openrouter"
      );
    }

    return buildProviderResult(
      providerId,
      coords,
      durationMs,
      expected,
      undefined,
      modelId,
      "openrouter"
    );
  } catch (err: unknown) {
    const durationMs = performance.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    logger.logProviderResponse(providerId, address, durationMs, null, message);
    return buildProviderResult(
      providerId,
      null,
      durationMs,
      expected,
      `OpenRouter request error: ${message}`,
      modelId,
      "openrouter"
    );
  }
}
