import { defineConfig } from "vitest/config";
import { configDefaults } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    // The opt-in acceptance suites burn real tokens and need network +
    // credentials, so the default `npm test` never runs them; each has its own
    // runner: the H8a programmatic live suite (`npm run test:live` /
    // `vitest.live.config.ts`), the H9a non-interactive `pi -p` suite
    // (`npm run test:acceptance` / `vitest.acceptance.config.ts`), and the
    // V20g production-path conformance suite (`npm run test:conformance` /
    // `vitest.conformance.config.ts`).
    exclude: [
      ...configDefaults.exclude,
      "tests/live/**",
      "tests/acceptance/**",
      "tests/conformance/**",
      // Live-host hardening probes (own runner: vitest.hardening.config.ts);
      // they boot a real session against a live provider, so they never run
      // under the default offline `npm test`.
      "tests/hardening/**",
    ],
    environment: "node",
  },
});
