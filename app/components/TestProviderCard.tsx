"use client";

import { useEffect, useState } from "react";
import {ProviderConfigStatus, ProviderResult, LatLng, AggregatorType} from "@/lib/types";
import { ModelDefinition } from "@/lib/models";

const SAMPLE_INPUTS = [
  {
    label: "San Jose. Acosta. 50 metros norte del Parque Monseñor Sanabria, frente a CoopeAlianza.",
    address: "San Jose. Acosta. 50 metros norte del Parque Monseñor Sanabria, frente a CoopeAlianza.",
    expected: {
      "lat": 9.799403,
      "lng": -84.162212
    },
  },
  {
    label: "Alajuela. Aguas Zarcas. Aguas Zarcas centro, diagonal a la oficina del ICE",
    address: "Alajuela. Aguas Zarcas. Aguas Zarcas centro, diagonal a la oficina del ICE",
    expected: {
      "lat": 10.374456,
      "lng": -84.339084
    }
  },
  {
    label: "Cartago. La Soledad. Costado Norte de los Tribunales de Justicia.",
    address: "Cartago. La Soledad. Costado Norte de los Tribunales de Justicia.",
    expected: {
      "lat": 9.863403,
      "lng": -83.917166
    }
  },
  {
    label: "Heredia. Barva. San Roque, Barva del Banco Nacional 800 Oeste, frente a la Clínica Nueva",
    address: "Heredia. Barva. San Roque, Barva del Banco Nacional 800 Oeste, frente a la Clínica Nueva",
    expected: {
      "lat": 10.020269,
      "lng": -84.131833
    }
  },
  {
    label: "Guanacaste. Cañas. Costado sur de Supercompro",
    address: "Guanacaste. Cañas. Costado sur de Supercompro",
    expected: {
      "lat": 10.426765,
      "lng": -85.094308
    }
  },
];

export default function TestProviderCard() {
  const [providers, setProviders] = useState<ProviderConfigStatus[]>([]);
  const [models, setModels] = useState<Record<string, ModelDefinition[]>>({});
  const [openRouterConfigured, setOpenRouterConfigured] = useState<boolean>(false);
  const [selectedProvider, setSelectedProvider] = useState<string>("google-gemini");
  const [selectedModels, setSelectedModels] = useState<Record<string, string>>({});
  const [aggregator, setAggregator] = useState<AggregatorType>("direct");
  const [address, setAddress] = useState<string>(SAMPLE_INPUTS[0].address);
  const [expectedLat, setExpectedLat] = useState<string>(SAMPLE_INPUTS[0].expected.lat.toString());
  const [expectedLng, setExpectedLng] = useState<string>(SAMPLE_INPUTS[0].expected.lng.toString());
  const [loading, setLoading] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    result?: ProviderResult;
    error?: string;
  } | null>(null);
  // Tracks which provider the current request is for
  const [requestProviderId, setRequestProviderId] = useState<string | null>(null);

  const handleSelectProvider = (providerId: string) => {
    setSelectedProvider(providerId);
    if (providerId === "nvidia") {
      setAggregator("openrouter");
    }
  };

  const refreshProviders = () => {
    fetch(`/api/test-provider?t=${Date.now()}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.providers) {
          setProviders(data.providers);
          if (data.providers.length > 0 && !data.providers.some((p: ProviderConfigStatus) => p.id === selectedProvider)) {
            handleSelectProvider(data.providers[0].id);
          }
        }
        if (data.models) {
          setModels(data.models);
        }
        if (typeof data.openRouterConfigured === "boolean") {
          setOpenRouterConfigured(data.openRouterConfigured);
        }
      })
      .catch((err) => console.error("Failed to load providers:", err));
  };

  useEffect(() => {
    refreshProviders();
  }, []);

  const handleModelChange = (providerId: string, modelId: string) => {
    setSelectedModels((prev) => ({
      ...prev,
      [providerId]: modelId,
    }));
  };

  const provModels = models[selectedProvider] || [];
  const activeModel =
    selectedModels[selectedProvider] ||
    provModels.find((m) => m.isDefault)?.id ||
    provModels[0]?.id ||
    "";
  const activeModelDef = provModels.find((m) => m.id === activeModel);

  const handleSelectSample = (sample: (typeof SAMPLE_INPUTS)[0]) => {
    setAddress(sample.address);
    setExpectedLat(sample.expected.lat.toString());
    setExpectedLng(sample.expected.lng.toString());
  };

  const handleRunTest = async () => {
    const controller = new AbortController();
    setAbortController(controller);
    setLoading(true);
    setTestResult(null);
    // Snapshot which provider this request belongs to
    setRequestProviderId(selectedProvider);

    let expected: LatLng | undefined = undefined;
    const lat = parseFloat(expectedLat);
    const lng = parseFloat(expectedLng);
    if (!isNaN(lat) && !isNaN(lng)) {
      expected = { lat, lng };
    }

    const isLlm = activeProvider?.type === "llm" || selectedProvider === "lm-studio";

    try {
      const response = await fetch("/api/test-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: selectedProvider,
          model: activeModel || undefined,
          aggregator: selectedProvider === "nvidia" ? "openrouter" : isLlm ? aggregator : "direct",
          input: address,
          expected,
        }),
        signal: controller.signal,
      });

      const data = await response.json();
      setTestResult(data);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        setTestResult({ success: false, error: "Request cancelled by user." });
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setTestResult({ success: false, error: `Network request failed: ${msg}` });
      }
    } finally {
      setLoading(false);
      setAbortController(null);
    }
  };

  const handleCancel = () => {
    abortController?.abort();
  };

  const activeProvider = providers.find((p) => p.id === selectedProvider);
  const isLlm = activeProvider?.type === "llm";

  return (
    <div className="rounded-xl border border-border bg-surface p-6 shadow-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-5 border-b border-border/80 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">🧪</span>
            <h2 className="text-lg font-semibold text-foreground">Interactive Provider Tester</h2>
          </div>
          <p className="text-muted mt-1">
            Test any geocoding adapter individually, measure latency, and verify geolib distance calculations.
          </p>
        </div>

        {activeProvider && (
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: activeProvider.color }}
            />
            <span className="text-foreground font-mono">{activeProvider.modelOrEndpoint}</span>
            <span
              className={`px-2 py-0.5 rounded-full border ${activeProvider.isConfigured
                ? "bg-success/10 border-success/30 text-success"
                : "bg-warning/10 border-warning/30 text-warning"
                }`}
            >
              {activeProvider.isConfigured ? "Ready" : "Unconfigured Key"}
            </span>

            <button
              type="button"
              onClick={refreshProviders}
              title="Re-check environment variables"
              className="p-1 rounded-md text-muted hover:text-foreground hover:bg-surface-elevated transition-colors border border-border"
            >
              🔄
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Form Controls */}
        <div className="md:col-span-2 space-y-4">
          {/* Provider Selector with Integrated Model Dropdowns */}
          <div>
            <label className="block font-semibold uppercase tracking-wider text-muted mb-2">
              Select Geocoding Provider
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {providers.map((p) => {
                const isSelected = p.id === selectedProvider;
                const pModels = models[p.id] || [];
                const hasModels = pModels.length > 0;
                const currentModel =
                  selectedModels[p.id] ||
                  pModels.find((m) => m.isDefault)?.id ||
                  pModels[0]?.id ||
                  "";
                const activeDef = pModels.find((m) => m.id === currentModel);

                return (
                  <div
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => !loading && handleSelectProvider(p.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        if (!loading) handleSelectProvider(p.id);
                      }
                    }}
                    className={`flex flex-col justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? "border-accent bg-accent/10 shadow-sm ring-1 ring-accent/30"
                        : "border-border hover:border-border-hover bg-surface-elevated/40"
                    } ${loading ? "opacity-75 cursor-not-allowed" : ""}`}
                  >
                    <div>
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="font-semibold text-sm text-foreground">{p.name}</span>
                        <div className="flex items-center gap-1.5">
                          {!p.isConfigured && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-warning/20 text-warning border border-warning/30">
                              ⚠ Key
                            </span>
                          )}
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: p.color }}
                          />
                        </div>
                      </div>
                      <span className="text-[10px] text-muted block uppercase tracking-wider">
                        {p.type.toUpperCase()} • {p.modelOrEndpoint || p.description}
                      </span>
                    </div>

                    {hasModels ? (
                      <div className="mt-2.5 pt-2 border-t border-border/40" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[10px] uppercase font-semibold text-muted">
                            Model
                          </label>
                          {isSelected && (
                            <span className="text-[9px] text-muted font-mono truncate max-w-[120px]">
                              {aggregator === "openrouter" && p.type === "llm"
                                ? activeDef?.openRouterModelId || currentModel
                                : activeDef?.directModelId || currentModel}
                            </span>
                          )}
                        </div>
                        <select
                          value={currentModel}
                          onChange={(e) => {
                            e.stopPropagation();
                            handleModelChange(p.id, e.target.value);
                            if (selectedProvider !== p.id && !loading) {
                              handleSelectProvider(p.id);
                            }
                          }}
                          disabled={loading}
                          className="w-full text-xs px-2 py-1.5 rounded-md bg-surface border border-border focus:border-accent focus:outline-none text-foreground font-medium"
                        >
                          {pModels.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div className="mt-2.5 pt-2 border-t border-border/30">
                        <span className="text-[10px] text-muted italic">Standard API Geocoder</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Aggregator Routing Mode for LLM providers */}
          {isLlm && (
            <div className="rounded-xl border border-border/70 bg-surface-elevated/40 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <label className="block font-semibold uppercase tracking-wider text-muted text-[11px]">
                  API Routing Mode ({activeProvider?.name})
                </label>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full border ${
                    selectedProvider === "nvidia" || aggregator === "openrouter"
                      ? openRouterConfigured
                        ? "bg-success/10 border-success/30 text-success"
                        : "bg-warning/10 border-warning/30 text-warning"
                      : activeProvider?.isConfigured
                      ? "bg-success/10 border-success/30 text-success"
                      : "bg-warning/10 border-warning/30 text-warning"
                  }`}
                >
                  {selectedProvider === "nvidia" || aggregator === "openrouter"
                    ? openRouterConfigured
                      ? "OpenRouter Ready"
                      : "OPENROUTER_API_KEY Missing"
                    : activeProvider?.isConfigured
                    ? `${activeProvider.name} Ready`
                    : "Direct Key Missing"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => selectedProvider !== "nvidia" && setAggregator("direct")}
                  disabled={loading || selectedProvider === "nvidia"}
                  title={
                    selectedProvider === "nvidia"
                      ? "Nvidia Nemotron is only accessible via OpenRouter"
                      : undefined
                  }
                  className={`flex items-center justify-center gap-2 p-2 rounded-lg border text-xs font-medium transition-all ${
                    selectedProvider === "nvidia"
                      ? "opacity-40 cursor-not-allowed border-border/50 bg-surface text-muted"
                      : aggregator === "direct"
                      ? "border-accent bg-accent/15 text-foreground shadow-sm cursor-pointer"
                      : "border-border hover:border-border-hover bg-surface text-muted hover:text-foreground cursor-pointer"
                  }`}
                >
                  <span>🔌</span>
                  <span>Direct Provider API</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAggregator("openrouter")}
                  disabled={loading}
                  className={`flex items-center justify-center gap-2 p-2 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                    aggregator === "openrouter"
                      ? "border-accent bg-accent/15 text-foreground shadow-sm"
                      : "border-border hover:border-border-hover bg-surface text-muted hover:text-foreground"
                  }`}
                >
                  <span>🌐</span>
                  <span>OpenRouter Aggregator</span>
                </button>
              </div>
              <p className="text-[11px] text-muted leading-relaxed">
                {selectedProvider === "nvidia"
                  ? `Nvidia Nemotron is queried exclusively via OpenRouter aggregator (${
                      activeModelDef?.openRouterModelId || activeModel
                    }). Requires OPENROUTER_API_KEY.`
                  : aggregator === "openrouter"
                  ? `Routes ${activeProvider?.name} queries through OpenRouter aggregator (${
                      activeModelDef?.openRouterModelId || activeModel
                    }). Requires OPENROUTER_API_KEY.`
                  : `Queries ${activeProvider?.name} directly via official API (${
                      activeModelDef?.directModelId || activeModel
                    }).`}
              </p>
            </div>
          )}

          {/* Quick Sample Selector */}
          <div>
            <label className="block font-semibold uppercase tracking-wider text-muted mb-1.5">
              Quick Test Addresses (from inputs.json)
            </label>
            <div className="flex flex-wrap gap-1.5">
              {SAMPLE_INPUTS.map((sample) => (
                <button
                  key={sample.label}
                  type="button"
                  onClick={() => handleSelectSample(sample)}
                  className={`px-2.5 py-1 rounded-md border transition-colors ${address === sample.address
                    ? "bg-accent text-white border-accent"
                    : "bg-surface-elevated text-muted hover:text-foreground border-border hover:border-border-hover"
                    }`}
                >
                  {sample.label}
                </button>
              ))}
            </div>
          </div>

          {/* Address Input */}
          <div>
            <label className="block font-semibold uppercase tracking-wider text-muted mb-1.5">
              Address / Location Query
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Enter an address or landmark..."
              className="w-full px-3.5 py-2.5 text-sm rounded-lg bg-surface-elevated border border-border focus:border-accent focus:outline-none text-foreground placeholder:text-muted/60"
            />
          </div>

          {/* Expected Lat/Lng */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold uppercase tracking-wider text-muted mb-1.5">
                Expected Lat
              </label>
              <input
                type="number"
                step="any"
                value={expectedLat}
                onChange={(e) => setExpectedLat(e.target.value)}
                placeholder="19.4352"
                className="w-full px-3 py-2 text-sm rounded-lg bg-surface-elevated border border-border focus:border-accent focus:outline-none text-foreground font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold uppercase tracking-wider text-muted mb-1.5">
                Expected Lng
              </label>
              <input
                type="number"
                step="any"
                value={expectedLng}
                onChange={(e) => setExpectedLng(e.target.value)}
                placeholder="-99.1412"
                className="w-full px-3 py-2 text-sm rounded-lg bg-surface-elevated border border-border focus:border-accent focus:outline-none text-foreground font-mono"
              />
            </div>
          </div>

          {/* Submit / Cancel buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRunTest}
              disabled={loading || !address.trim()}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md cursor-pointer"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                  </svg>
                  <span>Calling {providers.find((p) => p.id === requestProviderId)?.name || "Provider"}...</span>
                </>
              ) : (
                <span>⚡ Run Geocoding Test</span>
              )}
            </button>
            {loading && (
              <button
                type="button"
                onClick={handleCancel}
                title="Cancel request"
                className="px-3 py-2.5 rounded-lg border border-border text-muted hover:text-danger hover:border-danger/50 transition-colors"
              >
                ✕ Cancel
              </button>
            )}
          </div>
        </div>

        {/* Right Column: Live Result Display */}
        <div className="border border-border rounded-xl bg-surface-elevated/40 p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2 mb-3 border-b border-border">
              <span className="font-semibold uppercase tracking-wider text-muted">
                Test Output
              </span>
              {testResult && (
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${testResult.success
                    ? "bg-success/20 text-success border border-success/30"
                    : "bg-danger/20 text-danger border border-danger/30"
                    }`}
                >
                  {testResult.success ? "Success" : "Failed"}
                </span>
              )}
            </div>

            {!testResult && !loading && (
              <div className="py-12 text-center text-muted">
                <div className="text-3xl mb-2">📡</div>
                <p>Click &quot;Run Geocoding Test&quot; to test the selected provider adapter.</p>
              </div>
            )}

            {loading && (
              <div className="py-12 text-center text-muted animate-pulse">
                <div className="text-3xl mb-2">⏳</div>
                <p className="font-mono text-accent">
                  Querying {providers.find((p) => p.id === requestProviderId)?.name || "Provider"}...
                </p>
                <p className="text-[10px] text-muted mt-1">Measuring API latency & parsing coordinates</p>
              </div>
            )}

            {testResult && (
              <div className="space-y-3">
                {/* Result coordinates and duration */}
                {testResult.result?.result && (
                  <div className="rounded-lg bg-surface border border-border p-3 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-muted">Coordinates</span>
                      <span className="font-mono text-foreground font-semibold">
                        {testResult.result.result.lat.toFixed(5)}, {testResult.result.result.lng.toFixed(5)}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-muted">Response Latency</span>
                      <span className="font-mono text-accent font-semibold">
                        {testResult.result.durationMs} ms
                      </span>
                    </div>

                    {testResult.result.model && (
                      <div className="flex justify-between items-center">
                        <span className="text-muted">Model</span>
                        <span className="font-mono text-foreground font-semibold text-xs">
                          {testResult.result.model}
                        </span>
                      </div>
                    )}

                    {testResult.result.aggregator && (
                      <div className="flex justify-between items-center">
                        <span className="text-muted">Aggregator</span>
                        <span className="px-1.5 py-0.5 rounded bg-accent/15 border border-accent/30 text-accent font-semibold font-mono text-[10px]">
                          {testResult.result.aggregator.toUpperCase()}
                        </span>
                      </div>
                    )}

                    {testResult.result.distanceMeters !== null && (
                      <div className="flex justify-between items-center pt-1 border-t border-border/60">
                        <span className="text-muted">Geolib Geodesic Error</span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-foreground">
                            {testResult.result.formattedDistance}
                          </span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${testResult.result.distanceMeters <= 100
                              ? "bg-success/20 text-success"
                              : testResult.result.distanceMeters <= 1000
                                ? "bg-warning/20 text-warning"
                                : "bg-danger/20 text-danger"
                              }`}
                          >
                            {testResult.result.distanceMeters <= 100
                              ? "Excellent"
                              : testResult.result.distanceMeters <= 1000
                                ? "Moderate"
                                : "High Error"}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Error Banner */}
                {(!testResult.success || testResult.result?.error || testResult.error) && (
                  <div className="rounded-lg bg-danger/10 border border-danger/30 p-3 text-danger space-y-1">
                    <div className="font-semibold flex items-center gap-1">
                      <span>⚠️</span> Error Details:
                    </div>
                    <p className="text-[11px] leading-relaxed break-words font-mono">
                      {testResult.result?.error || testResult.error}
                    </p>
                    {activeProvider && !activeProvider.isConfigured && aggregator === "direct" && (
                      <p className="text-[10px] text-muted pt-1 border-t border-danger/20">
                        💡 Configure <code className="text-foreground">{activeProvider.missingEnvVars?.join(", ")}</code> in <code className="text-foreground">.env.local</code> to enable direct provider queries.
                      </p>
                    )}
                    {aggregator === "openrouter" && !openRouterConfigured && (
                      <p className="text-[10px] text-muted pt-1 border-t border-danger/20">
                        💡 Configure <code className="text-foreground">OPENROUTER_API_KEY</code> in <code className="text-foreground">.env.local</code> to query via OpenRouter.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quick curl guide */}
          <div className="mt-4 pt-3 border-t border-border/60">
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted block mb-1">
              Terminal / Curl Equivalent:
            </span>
            <div className="bg-background/80 p-2 rounded border border-border text-[10px] font-mono text-muted select-all overflow-x-auto">
              curl -X POST http://localhost:3200/api/test-provider \<br />
              &nbsp;&nbsp;-H &quot;Content-Type: application/json&quot; \<br />
              &nbsp;&nbsp;-d &apos;{JSON.stringify({ provider: selectedProvider, model: activeModel || undefined, aggregator: isLlm ? aggregator : undefined, input: address.slice(0, 30) })}&apos;
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
