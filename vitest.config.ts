import { defineConfig } from "vitest/config";
import { configDefaults } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    // The opt-in acceptance suites burn real tokens and need network +
    // credentials, so the default `npm test` never runs them; each has its own
    // runner: the H8a programmatic live suite (`npm run test:live` /
    // `vitest.live.config.ts`) and the H9a non-interactive `pi -p` suite
    // (`npm run test:acceptance` / `vitest.acceptance.config.ts`).
    exclude: [...configDefaults.exclude, "tests/live/**", "tests/acceptance/**"],
    environment: "node",
  },
});
