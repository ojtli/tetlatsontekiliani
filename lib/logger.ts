/**
 * Structured logger for geocoding providers, requests, and batch runs.
 */

export interface LogDetails {
  provider?: string;
  durationMs?: number;
  input?: string;
  status?: number | string;
  responsePreview?: string;
  error?: string;
  [key: string]: unknown;
}

function formatPreview(data: unknown, maxLength = 250): string {
  if (data === null || data === undefined) return "null";
  const str = typeof data === "string" ? data : JSON.stringify(data);
  const singleLine = str.replace(/\s+/g, " ").trim();
  return singleLine.length > maxLength
    ? `${singleLine.slice(0, maxLength)}... [truncated]`
    : singleLine;
}

export const logger = {
  info(message: string, details?: LogDetails): void {
    const timestamp = new Date().toISOString();
    const detailsStr = details ? ` | ${JSON.stringify(details)}` : "";
    console.log(`[${timestamp}] [INFO] ${message}${detailsStr}`);
  },

  warn(message: string, details?: LogDetails): void {
    const timestamp = new Date().toISOString();
    const detailsStr = details ? ` | ${JSON.stringify(details)}` : "";
    console.warn(`[${timestamp}] [WARN] ${message}${detailsStr}`);
  },

  error(message: string, details?: LogDetails): void {
    const timestamp = new Date().toISOString();
    const detailsStr = details ? ` | ${JSON.stringify(details)}` : "";
    console.error(`[${timestamp}] [ERROR] ${message}${detailsStr}`);
  },

  logProviderResponse(
    provider: string,
    input: string,
    durationMs: number,
    responseOrText: unknown,
    error?: string
  ): void {
    const preview = formatPreview(responseOrText);
    if (error) {
      this.error(`Provider [${provider}] failed after ${Math.round(durationMs)}ms`, {
        provider,
        durationMs: Math.round(durationMs),
        input: formatPreview(input, 100),
        responsePreview: preview,
        error,
      });
    } else {
      this.info(`Provider [${provider}] succeeded in ${Math.round(durationMs)}ms`, {
        provider,
        durationMs: Math.round(durationMs),
        input: formatPreview(input, 100),
        responsePreview: preview,
      });
    }
  },

  formatPreview,
};
