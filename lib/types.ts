// Shared types for the geocoder comparison tool

export interface LatLng {
  lat: number;
  lng: number;
}

export interface GeocodingInput {
  input: string;
  expectedResult: LatLng | null;
}

export interface ProviderResult {
  provider: string;
  model?: string;
  aggregator?: string;
  result: LatLng | null;
  durationMs: number;
  distanceMeters: number | null;
  formattedDistance?: string;
  isOutlier?: boolean;
  error?: string;
}

export interface GeocodingResultEntry {
  input: string;
  expectedResult: LatLng | null;
  providersResults: ProviderResult[];
}

export interface ProviderSummaryMetrics {
  provider: string;
  model?: string;
  total: number;
  success: number;
  errors: number;
  outliers: number;
  successRate: number;
  totalMs: number;
  avgDurationMs: number;
  totalDistanceMeters: number;
  avgDistanceMeters: number | null;
  medianDistanceMeters: number | null;
  rawAvgDistanceMeters: number | null;
  minDistanceMeters: number | null;
  maxDistanceMeters: number | null;
  accuracyTiers: {
    excellent: number;
    moderate: number;
    poor: number;
  };
}

export interface JobSummary {
  totalInputs: number;
  completedInputs: number;
  elapsedMs: number;
  topProvider: string | null;
  providers: Record<string, ProviderSummaryMetrics>;
}

export interface JobResultFile {
  filename: string;
  startedAt: string;
  completedAt: string;
  providers: string[];
  providerModels?: Record<string, string>;
  results: GeocodingResultEntry[];
  summary?: JobSummary;
}

export type JobState = "idle" | "running" | "completed" | "cancelled" | "error";

export type DoneEvent = {
  state: JobState;
  totalInputs: number;
  completedInputs: number;
  elapsedMs: number;
  savedFilename: string | null;
  errors: string[];
}

export type JobStatus = DoneEvent & {
  currentInput: string | null;
  startTime: string | null;
  selectedProviders: string[];
}

type ProviderType = "api" | "llm" | "local";

export interface ProviderInfo {
  id: string;
  name: string;
  description: string;
  color: string;
  type: ProviderType;
}

export interface ProviderConfigStatus extends ProviderInfo {
  isConfigured: boolean;
  modelOrEndpoint?: string;
  missingEnvVars?: string[];
}

export type AggregatorType = "direct" | "openrouter"

export interface GeocodeOptions {
  model?: string;
  aggregator?: AggregatorType | string;
}

export interface ProviderAdapter {
  id: string;
  name: string;
  type: ProviderType;
  model?: string;
  isConfigured(): boolean;
  getConfigStatus(): { isConfigured: boolean; modelOrEndpoint?: string; missingEnvVars?: string[] };
  geocode(address: string, expected?: LatLng | null, options?: GeocodeOptions): Promise<ProviderResult>;
  extractCoordinates?(raw: unknown): LatLng | null;
}

export interface TabItem {
  id: string;
  href: string;
  label: string;
  icon: string;
}