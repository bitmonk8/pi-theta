import { defineConfig } from "vitest/config";

// H9a-T — dedicated runner for the OPT-IN, non-interactive `pi -p` real-host
// acceptance suite (Phase 1 of the two-phase loom 1.0 release gate,
// real-host-smoke-gate.md).
//
// Invoked only by `npm run test:acceptance`; it SPAWNS the real `pi` binary in
// print mode (`pi -p --loom <dir> "/<name>"`, process-and-exit) against a live
// provider/model — higher fidelity than the H8a programmatic SDK harness
// because it exercises real extension auto-load, flag/arg parsing, and
// discovery. It burns real tokens and needs network + credentials, so it is
// deliberately kept OUT of both the default `npm test` and the H8a
// `npm run test:live` suite. This config includes ONLY the acceptance suite.
// When no live provider is configured the suite fails loudly naming the missing
// precondition (never a silent skip) — but only AFTER its intended-reason,
// token-free red (the feature-loom fixture is absent) has already fired.
export default defineConfig({
  test: {
    include: ["tests/acceptance/**/*.test.ts"],
    environment: "node",
    // Each loom drives one or more live turns through a spawned `pi -p`
    // process; give each ample room without stalling CI.
    testTimeout: 180000,
    hookTimeout: 180000,
  },
});
