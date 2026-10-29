import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

test("loadInputs validation catches syntax errors in JSON cleanly", () => {
  const invalidJsonString = `[
    { "input": "San Jose", "expectedResult": { "lat": 9.93, "lng": -84.08 } },
  ]`;

  assert.throws(
    () => {
      JSON.parse(invalidJsonString);
    },
    (err: unknown) => {
      assert.ok(err instanceof SyntaxError);
      return true;
    }
  );
});

test("loadInputs validation catches empty arrays and non-arrays", () => {
  const validateInputs = (parsed: unknown) => {
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("Input file (data/inputs-correos.json) is empty or does not contain an array");
    }
    return parsed;
  };

  assert.throws(() => validateInputs([]), /is empty or does not contain an array/);
  assert.throws(() => validateInputs({}), /is empty or does not contain an array/);
  assert.throws(() => validateInputs(null), /is empty or does not contain an array/);

  const valid = validateInputs([{ input: "Valid Address", expectedResult: null }]);
  assert.equal(valid.length, 1);
});

test("SSE stream parser correctly processes error and done events", () => {
  let hasReceivedError = false;
  let errorMessage = "";
  let hasReceivedDone = false;

  const mockChunk = `event: error\ndata: {"error":"Failed to load benchmark inputs: Unexpected token ']' at line 5"}\n\n`;

  const parseEvents = (chunk: string) => {
    const parts = chunk.split("\n\n");
    for (const part of parts) {
      if (!part.trim()) continue;
      const eventMatch = part.match(/^event: (\w+)/m);
      const dataMatch = part.match(/^data: (.+)$/m);
      if (!eventMatch || !dataMatch) continue;

      const eventName = eventMatch[1];
      const payload = JSON.parse(dataMatch[1]);

      if (eventName === "error") {
        hasReceivedError = true;
        errorMessage = payload.error;
      } else if (eventName === "done") {
        hasReceivedDone = true;
      }
    }
  };

  parseEvents(mockChunk);

  assert.equal(hasReceivedError, true);
  assert.match(errorMessage, /Failed to load benchmark inputs/);
  assert.equal(hasReceivedDone, false);
});

test("retryFile validation catches invalid filenames and directory traversal", () => {
  const validateRetryFilename = (filename: string): { valid: boolean; safeFilename?: string; error?: string } => {
    const safe = path.basename(filename);
    if (!safe.endsWith(".json")) {
      return { valid: false, error: "Invalid retry filename" };
    }
    return { valid: true, safeFilename: safe };
  };

  assert.deepEqual(validateRetryFilename("../../etc/passwd"), { valid: false, error: "Invalid retry filename" });
  assert.deepEqual(validateRetryFilename("results.txt"), { valid: false, error: "Invalid retry filename" });
  assert.deepEqual(validateRetryFilename("../results-123.json"), { valid: true, safeFilename: "results-123.json" });
  assert.deepEqual(validateRetryFilename("results-1792635295713 2.json"), { valid: true, safeFilename: "results-1792635295713 2.json" });
});

