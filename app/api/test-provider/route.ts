import { NextResponse } from "next/server";
import { getProvider, getAllProviders, getProviderConfigStatuses, isOpenRouterConfigured } from "@/lib/providers";
import { getAvailableModels, ModelDefinition } from "@/lib/models";
import {AggregatorType, LatLng} from "@/lib/types";

export async function GET(_req: Request) {
  try {
    const statuses = getProviderConfigStatuses();
    const modelsByProvider: Record<string, ModelDefinition[]> = {};
    for (const p of statuses) {
      const provModels = getAvailableModels(p.id);
      if (provModels.length > 0) {
        modelsByProvider[p.id] = provModels;
      }
    }

    return NextResponse.json({
      providers: statuses,
      models: modelsByProvider,
      openRouterConfigured: isOpenRouterConfigured(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Failed to load provider statuses: ${msg}` },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Request body must be a valid JSON object" },
        { status: 400 }
      );
    }

    const { provider, model, aggregator, input, expected } = body as {
      provider?: string;
      model?: string;
      aggregator?: AggregatorType;
      input?: string;
      expected?: LatLng;
    };

    if (!provider || typeof provider !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'provider' field" },
        { status: 400 }
      );
    }

    if (!input || typeof input !== "string" || input.trim().length === 0) {
      return NextResponse.json(
        { error: "Missing or invalid 'input' address field" },
        { status: 400 }
      );
    }

    const adapter = getProvider(provider);
    if (!adapter) {
      return NextResponse.json(
        { error: `Unknown provider: '${provider}'. Available: ${getAllProviders().map((p) => p.id).join(", ")}` },
        { status: 404 }
      );
    }

    // Run geocoding with duration measurement and geolib distance calculation
    const result = await adapter.geocode(input.trim(), expected, {
      model,
      aggregator,
    });

    return NextResponse.json({
      success: !result.error,
      result,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Internal test provider error: ${msg}` },
      { status: 500 }
    );
  }
}
