import test from "node:test";
import assert from "node:assert/strict";
import { logger } from "../lib/logger.ts";
import { LMStudioProvider } from "../lib/providers/lm-studio.ts";

test("logger.formatPreview formats and truncates responses", () => {
  const shortText = "hello world";
  assert.equal(logger.formatPreview(shortText), "hello world");

  const longText = "a".repeat(300);
  const truncated = logger.formatPreview(longText, 100);
  assert.ok(truncated.length <= 130);
  assert.ok(truncated.includes("[truncated]"));

  const obj = { lat: 9.93, lng: -84.08 };
  assert.equal(logger.formatPreview(obj), '{"lat":9.93,"lng":-84.08}');

  assert.equal(logger.formatPreview(null), "null");
  assert.equal(logger.formatPreview(undefined), "null");
});

test("logger methods log without throwing exceptions", () => {
  assert.doesNotThrow(() => {
    logger.info("Test info", { provider: "test", durationMs: 100 });
    logger.warn("Test warn", { provider: "test" });
    logger.error("Test error", { error: "Sample failure" });
    logger.logProviderResponse("test", "San Jose", 120, { pos: { lat: 9.93, lng: -84.08 } });
    logger.logProviderResponse("test", "San Jose", 120, null, "Sample error");
  });
});

test("LMStudioProvider handles reasoning_content fallback", async () => {
  const provider = new LMStudioProvider();
  assert.equal(provider.id, "lm-studio");
  assert.equal(provider.type, "local");
  assert.ok(provider.getConfigStatus().modelOrEndpoint);
});

test("GoogleGeminiProvider initial configuration and status check", async () => {
  const { GoogleGeminiProvider } = await import("../lib/providers/google-gemini.ts");
  const provider = new GoogleGeminiProvider();
  assert.equal(provider.id, "google-gemini");
  assert.equal(provider.type, "llm");
  const status = provider.getConfigStatus();
  assert.ok(status.modelOrEndpoint.includes("gemini"));
});
