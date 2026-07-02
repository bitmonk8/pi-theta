import { defineConfig } from "vitest/config";

// H8a-T — dedicated runner for the OPT-IN live-host acceptance suite.
//
// Invoked only by `npm run test:live`; it burns real tokens against a live
// provider/model and requires network + credentials, so it is deliberately kept
// OUT of the default `npm test` (which excludes `tests/live/**`). This config
// includes ONLY the live suite. When no live provider is configured the suite
// fails loudly naming the missing precondition (never a silent skip).
export default defineConfig({
  test: {
    include: ["tests/live/**/*.test.ts"],
    environment: "node",
    // Live turns are network-bound; give each ample room without stalling CI.
    testTimeout: 120000,
    hookTimeout: 120000,
  },
});
