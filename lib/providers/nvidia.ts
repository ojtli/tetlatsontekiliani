import { LatLng, ProviderAdapter, ProviderResult, GeocodeOptions } from "../types";
import { getDefaultModelId } from "../models";
import { geocodeWithOpenRouter, isOpenRouterConfigured } from "./openrouter";

export class NvidiaProvider implements ProviderAdapter {
  id = "nvidia";
  name = "Nvidia";
  type = "llm" as const;

  get model(): string {
    return getDefaultModelId(this.id);
  }

  isConfigured(): boolean {
    // OpenRouter is the only way to query this model
    return isOpenRouterConfigured();
  }

  getConfigStatus() {
    return {
      isConfigured: this.isConfigured(),
      modelOrEndpoint: this.model,
      missingEnvVars: !this.isConfigured() ? ["OPENROUTER_API_KEY"] : undefined,
    };
  }

  async geocode(
    address: string,
    expected?: LatLng | null,
    options?: GeocodeOptions
  ): Promise<ProviderResult> {
    const activeModel = options?.model || this.model;

    // OpenRouter aggregator is the only route available for this model
    return geocodeWithOpenRouter(this.id, activeModel, address, expected);
  }
}
