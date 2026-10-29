import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createOutlierNoticeHtml,
  createTargetDivIconHtml,
  createProviderDivIconHtml,
  createTargetMarkerPopupHtml,
  createOverviewTargetPopupHtml,
  createProviderCirclePopupHtml,
  createProviderPinPopupHtml,
  toggleSetItem,
} from "../app/components/map/map-helpers";
import { DeltaResult } from "../lib/compare";

test("createOutlierNoticeHtml generates banner when isOutlier is true and empty string when false", () => {
  const outlierHtml = createOutlierNoticeHtml(true, 500000);
  assert.ok(outlierHtml.includes("Outlier"));
  assert.ok(outlierHtml.includes("500.0 km"));
  assert.ok(outlierHtml.includes("Exceeds Costa Rica's 460km span"));

  const normalHtml = createOutlierNoticeHtml(false, 150);
  assert.equal(normalHtml, "");
});

test("createTargetDivIconHtml outputs target badge with index and selected state styling", () => {
  const normal = createTargetDivIconHtml(0, false);
  assert.ok(normal.includes("🎯"));
  assert.ok(normal.includes("#1"));
  assert.ok(normal.includes("rgba(245, 158, 11, 0.7)"));
  assert.ok(!normal.includes("scale(1.15)"));

  const selected = createTargetDivIconHtml(4, true);
  assert.ok(selected.includes("🎯"));
  assert.ok(selected.includes("#5"));
  assert.ok(selected.includes("scale(1.15)"));
  assert.ok(selected.includes("0 0 0 2px #f59e0b"));
});

test("createProviderDivIconHtml outputs circle with provider initial and color", () => {
  const openaiIcon = createProviderDivIconHtml("openai", "#a855f7");
  assert.ok(openaiIcon.includes("#a855f7"));
  // PROVIDER_INITIALS["openai"] is "A"
  assert.ok(openaiIcon.includes("A"));

  const customIcon = createProviderDivIconHtml("custom", "#ff0000");
  assert.ok(customIcon.includes("#ff0000"));
  assert.ok(customIcon.includes("C"));
});

test("createTargetMarkerPopupHtml includes ground truth target label, input, and coordinates", () => {
  const popup = createTargetMarkerPopupHtml(
    2,
    "Parque Central, San Jose",
    9.9333,
    -84.0833
  );
  assert.ok(popup.includes("Ground Truth Target #3"));
  assert.ok(popup.includes("Parque Central, San Jose"));
  assert.ok(popup.includes("9.933300, -84.083300"));
});

test("createOverviewTargetPopupHtml includes target label, coordinates, and button with correct ID", () => {
  const popup = createOverviewTargetPopupHtml(
    0,
    "Teatro Nacional",
    9.9331,
    -84.0769,
    "goto-pin-0"
  );
  assert.ok(popup.includes("Target #1"));
  assert.ok(popup.includes("Teatro Nacional"));
  assert.ok(popup.includes("id=\"goto-pin-0\""));
  assert.ok(popup.includes("Zoom In &amp; View Circles →"));
});

test("createProviderCirclePopupHtml formats single run and comparison delta correctly", () => {
  // Test single run mode (no delta, no runLabel)
  const singleRunPopup = createProviderCirclePopupHtml({
    provider: "openai",
    color: "#a855f7",
    entryIdx: 0,
    distMeters: 45,
    durationMs: 320,
    lat: 9.9334,
    lng: -84.0834,
    isOutlier: false,
  });
  assert.ok(singleRunPopup.includes("openai"));
  assert.ok(singleRunPopup.includes("45 m"));
  assert.ok(singleRunPopup.includes("320 ms"));
  assert.ok(singleRunPopup.includes("9.933400, -84.083400"));
  assert.ok(!singleRunPopup.includes("vs Baseline"));

  // Test comparison mode with delta improvement
  const deltaImprovement: DeltaResult = {
    diffMeters: -50,
    percentChange: -52.6,
    type: "improvement",
    formattedDelta: "-50 m (-52.6%)",
  };
  const comparePopup = createProviderCirclePopupHtml({
    provider: "google-gemini",
    color: "#3b82f6",
    entryIdx: 1,
    distMeters: 45,
    durationMs: 250,
    lat: 9.933,
    lng: -84.083,
    isOutlier: false,
    runLabel: "Run B",
    delta: deltaImprovement,
  });
  assert.ok(comparePopup.includes("Run B"));
  assert.ok(comparePopup.includes("vs Baseline (Run A):"));
  assert.ok(comparePopup.includes("-50 m (-52.6%)"));
  assert.ok(comparePopup.includes("#22c55e")); // improvement color

  // Test outlier notice inclusion
  const outlierPopup = createProviderCirclePopupHtml({
    provider: "anthropic",
    color: "#f97316",
    entryIdx: 2,
    distMeters: 550000,
    durationMs: 1200,
    lat: 14.123,
    lng: -87.456,
    isOutlier: true,
  });
  assert.ok(outlierPopup.includes("⚠ Outlier (550.0 km)"));
});

test("createProviderPinPopupHtml formats provider details and comparison delta", () => {
  const pinPopup = createProviderPinPopupHtml({
    provider: "nvidia",
    color: "#76b900",
    entryIdx: 3,
    distMeters: 120,
    lat: 9.934,
    lng: -84.082,
  });
  assert.ok(pinPopup.includes("nvidia"));
  assert.ok(pinPopup.includes("Distance: 120 m"));
  assert.ok(pinPopup.includes("9.934000, -84.082000"));

  const deltaRegression: DeltaResult = {
    diffMeters: 80,
    percentChange: 200,
    type: "regression",
    formattedDelta: "+80 m (+200.0%)",
  };
  const pinWithDelta = createProviderPinPopupHtml({
    provider: "nvidia",
    color: "#76b900",
    entryIdx: 3,
    distMeters: 120,
    lat: 9.934,
    lng: -84.082,
    delta: deltaRegression,
  });
  assert.ok(pinWithDelta.includes("Delta: +80 m (+200.0%)"));
  assert.ok(pinWithDelta.includes("#ef4444")); // regression color
});

test("toggleSetItem immutably toggles set membership", () => {
  const initial = new Set(["openai", "anthropic"]);

  // Removing an existing item
  const removed = toggleSetItem(initial, "openai");
  assert.equal(removed.has("openai"), false);
  assert.equal(removed.has("anthropic"), true);
  // Ensure immutability
  assert.equal(initial.has("openai"), true);

  // Adding a new item
  const added = toggleSetItem(removed, "google-gemini");
  assert.equal(added.has("google-gemini"), true);
  assert.equal(added.has("anthropic"), true);
  assert.equal(added.has("openai"), false);
});
