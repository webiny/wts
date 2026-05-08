import { test } from "node:test";
import assert from "node:assert/strict";

// Smoke test: just confirm the react entrypoint module evaluates and exports the expected names.
// Full render tests would require jsdom; consumers integration-test in their own apps.

const reactEntry = await import("../src/react.tsx");

test("react entrypoint exports the expected API", () => {
  assert.equal(typeof reactEntry.TelemetryProvider, "function");
  assert.equal(typeof reactEntry.useTelemetry, "function");
  assert.equal(typeof reactEntry.useTrackPageView, "function");
  assert.equal(typeof reactEntry.WTS, "function");
});
