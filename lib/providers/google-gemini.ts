import { GoogleGenAI } from "@google/genai";
import { LatLng, ProviderAdapter, ProviderResult, GeocodeOptions } from "../types";
import { logger } from "../logger";
import { resolveDirectModelId, getDefaultModelId } from "../models";
import { geocodeWithOpenRouter } from "./openrouter";
import {
  buildProviderResult,
  parseGeocodingResponse,
} from "./base";
import {
  LLM_GEOCODING_SYSTEM_PROMPT_V1,
  LLM_GEOCODING_USER_PROMPT_V1,
} from "../prompts";


export class GoogleGeminiProvider implements ProviderAdapter {
  id = "google-gemini";
  name = "Google Gemini";
  type = "llm" as const;

  private get apiKey(): string | undefined {
    return process.env.GOOGLE_GEMINI_API_KEY;
  }

  get model(): string {
    return getDefaultModelId(this.id);
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0 && !this.apiKey.includes("your_"));
  }

  getConfigStatus() {
    return {
      isConfigured: this.isConfigured(),
      modelOrEndpoint: this.model,
      missingEnvVars: !this.isConfigured() ? ["GOOGLE_GEMINI_API_KEY"] : undefined,
    };
  }

  async geocode(
    address: string,
    expected?: LatLng | null,
    options?: GeocodeOptions
  ): Promise<ProviderResult> {
    const activeModel = options?.model || this.model;

    // Route through OpenRouter aggregator if selected
    if (options?.aggregator === "openrouter") {
      return geocodeWithOpenRouter(this.id, activeModel, address, expected);
    }

    const start = performance.now();

    if (!this.apiKey || !this.isConfigured()) {
      return buildProviderResult(
        this.id,
        null,
        0,
        expected,
        "GOOGLE_GEMINI_API_KEY is not configured in .env.local",
        activeModel
      );
    }

    const directModel = resolveDirectModelId(this.id, activeModel);
    const ai = new GoogleGenAI({ apiKey: this.apiKey });
    const prompt = LLM_GEOCODING_USER_PROMPT_V1(address);
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: directModel,
          contents: prompt,
          config: {
            systemInstruction: LLM_GEOCODING_SYSTEM_PROMPT_V1,
            responseMimeType: "application/json",
            temperature: 0.1,
          },
        });

        const durationMs = performance.now() - start;
        const text = response.text;
        logger.logProviderResponse(this.id, address, durationMs, text);

        if (!text) {
          return buildProviderResult(
            this.id,
            null,
            durationMs,
            expected,
            "Gemini returned an empty response",
            activeModel
          );
        }

        const { coords, error } = parseGeocodingResponse(text);

        if (error) {
          return buildProviderResult(
            this.id,
            null,
            durationMs,
            expected,
            `Gemini parse error: ${error}`,
            activeModel
          );
        }

        return buildProviderResult(this.id, coords, durationMs, expected, undefined, activeModel);
      } catch (err: unknown) {
        const durationMs = performance.now() - start;
        const message = err instanceof Error ? err.message : String(err);

        // Check if error is a hard daily quota exhaustion (e.g. Free Tier 20 requests/day exceeded)
        const isHardQuota =
          message.includes("quota exceeded") ||
          message.includes("QuotaFailure") ||
          message.includes("FreeTier") ||
          message.includes("GenerateRequestsPerDay") ||
          /retry in \d+h/i.test(message) ||
          /retryDelay.*?\d{4,}s/i.test(message);

        // Transient errors eligible for quick backoff (short 429 burst/RPM, 503 high demand, 504)
        const isTransient =
          !isHardQuota &&
          (message.includes("503") ||
            message.includes("high demand") ||
            message.includes("UNAVAILABLE") ||
            message.includes("429"));

        if (isTransient && attempt < maxRetries) {
          const delayMs = attempt * 1500;
          logger.warn(
            `Gemini request hit transient rate limit (attempt ${attempt}/${maxRetries}), retrying in ${delayMs}ms: ${message}`,
            { provider: this.id, input: address, attempt, delayMs }
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }

        // Extract a clean user-friendly error summary if it's JSON
        let displayError = message;
        try {
          const parsed = JSON.parse(message);
          if (parsed?.error?.message) {
            displayError = parsed.error.message;
          }
        } catch {
          // keep original message
        }

        logger.logProviderResponse(this.id, address, durationMs, null, displayError);
        return buildProviderResult(
          this.id,
          null,
          durationMs,
          expected,
          `Gemini API error: ${displayError}`,
          activeModel
        );
      }
    }

    const durationMs = performance.now() - start;
    return buildProviderResult(
      this.id,
      null,
      durationMs,
      expected,
      "Gemini failed after retries",
      activeModel
    );
  }
}
