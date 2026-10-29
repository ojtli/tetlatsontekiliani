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


export class AnthropicProvider implements ProviderAdapter {
  id = "anthropic";
  name = "Anthropic Claude";
  type = "llm" as const;

  private get apiKey(): string | undefined {
    return process.env.ANTHROPIC_API_KEY;
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
      missingEnvVars: !this.isConfigured() ? ["ANTHROPIC_API_KEY"] : undefined,
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
        "ANTHROPIC_API_KEY is not configured in .env.local",
        activeModel
      );
    }

    const directModel = resolveDirectModelId(this.id, activeModel);

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: directModel,
          max_tokens: 150,
          temperature: 0.1,
          system: LLM_GEOCODING_SYSTEM_PROMPT_V1,
          messages: [
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
        logger.logProviderResponse(this.id, address, durationMs, errorData, `HTTP ${response.status}`);
        return buildProviderResult(
          this.id,
          null,
          durationMs,
          expected,
          `Anthropic error ${response.status}: ${msg}`,
          activeModel
        );
      }

      const data = await response.json();
      const content = data.content?.[0]?.text;
      logger.logProviderResponse(this.id, address, durationMs, content ?? data);

      if (!content) {
        return buildProviderResult(
          this.id,
          null,
          durationMs,
          expected,
          "Claude returned no text content",
          activeModel
        );
      }

      const { coords, error } = parseGeocodingResponse(content);

      if (error) {
        return buildProviderResult(
          this.id,
          null,
          durationMs,
          expected,
          `Claude parse error: ${error}`,
          activeModel
        );
      }

      return buildProviderResult(this.id, coords, durationMs, expected, undefined, activeModel);
    } catch (err: unknown) {
      const durationMs = performance.now() - start;
      const message = err instanceof Error ? err.message : String(err);
      logger.logProviderResponse(this.id, address, durationMs, null, message);
      return buildProviderResult(
        this.id,
        null,
        durationMs,
        expected,
        `Anthropic request error: ${message}`,
        activeModel
      );
    }
  }
}
