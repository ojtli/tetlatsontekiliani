import { LatLng, ProviderAdapter, ProviderResult, GeocodeOptions } from "../types";
import { logger } from "../logger";
import { getDefaultModelId } from "../models";
import {
  buildProviderResult,
  parseGeocodingResponse,
} from "./base";
import {
  LLM_GEOCODING_SYSTEM_PROMPT_V1,
  LLM_GEOCODING_USER_PROMPT_V1,
} from "../prompts";


export class LMStudioProvider implements ProviderAdapter {
  id = "lm-studio";
  name = "LM Studio";
  type = "local" as const;

  private get apiUrl(): string {
    return process.env.LM_STUDIO_API_URL || "http://localhost:1234/v1/chat/completions";
  }

  get model(): string {
    return getDefaultModelId(this.id);
  }

  isConfigured(): boolean {
    return Boolean(this.apiUrl && this.apiUrl.trim().length > 0);
  }

  getConfigStatus() {
    return {
      isConfigured: this.isConfigured(),
      modelOrEndpoint: this.model,
    };
  }

  async geocode(
    address: string,
    expected?: LatLng | null,
    options?: GeocodeOptions
  ): Promise<ProviderResult> {
    const activeModel = options?.model || this.model;
    const start = performance.now();

    try {
      const response = await fetch(this.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: activeModel,
          temperature: 0.1,
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
        signal: AbortSignal.timeout(parseInt(process.env.LM_STUDIO_TIMEOUT_MS || "120000", 10)),
      });

      const durationMs = performance.now() - start;

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        logger.logProviderResponse(this.id, address, durationMs, text, `HTTP ${response.status}`);
        return buildProviderResult(
          this.id,
          null,
          durationMs,
          expected,
          `LM Studio error ${response.status}: ${text || response.statusText}`,
          activeModel
        );
      }

      const data = await response.json();
      const message = data.choices?.[0]?.message;
      const content = message?.content || message?.reasoning_content;

      logger.logProviderResponse(this.id, address, durationMs, content ?? data);

      if (!content) {
        return buildProviderResult(
          this.id,
          null,
          durationMs,
          expected,
          "LM Studio returned no content",
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
          `LM Studio parse error: ${error}`,
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
        `LM Studio network error (is LM Studio server running on port 1234?): ${message}`,
        activeModel
      );
    }
  }
}
