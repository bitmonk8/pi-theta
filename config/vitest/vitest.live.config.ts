import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// This config lives under config/vitest/; pin the project root to the repo root
// so the tests/** include globs resolve from the repository, not this dir.
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

// Dedicated runner for the OPT-IN live-host suite — both halves:
//
//   • H8a (`tests/live/*.test.ts`) — programmatic SDK harness driving live
//     turns through `createAgentSession`.
//   • H9a (`tests/live/acceptance/**`) — non-interactive real-host acceptance:
//     SPAWNS the real `pi` binary in print mode (`pi -p --theta <dir>
//     "/<name>"`, process-and-exit) against a live provider/model — higher
//     fidelity than the programmatic harness because it exercises real
//     extension auto-load, flag/arg parsing, and discovery.
//   • Probes (`tests/live/hardening/**`) — live-axis probes kept from the
//     hardening campaign because no default or acceptance test covers their
//     surface: model-driven tool loops + the `max_rounds` ceiling (prompt and
//     subagent mode), every-query user-visible streaming, model replies flowing
//     back as values across a multi-turn drive, prompt→prompt invoke attach, a
//     query inside an imported `.thetalib` fn, and one live drive per recent
//     RFC (subagent fn / par for / computed tool-args).
//
// Invoked only by `npm run test:live`; it burns real tokens against a live
// provider/model and requires network + credentials, so it is deliberately kept
// OUT of the default `npm test` (which excludes `tests/live/**`). When no live
// provider is configured the suite fails loudly naming the missing
// precondition (never a silent skip).
export default defineConfig({
  root: repoRoot,
  test: {
    include: ["tests/live/**/*.test.ts"],
    environment: "node",
    // Live turns are network-bound, and each H9a theta drives one or more
    // turns through a spawned `pi -p` process; give each ample room without
    // stalling CI.
    testTimeout: 180000,
    hookTimeout: 180000,
    // Probes and acceptance runs boot real sessions; keep files serial to
    // avoid provider contention and rate limits.
    fileParallelism: false,
  },
});
