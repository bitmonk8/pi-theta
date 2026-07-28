import { defineConfig } from "vitest/config";
import { configDefaults } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    // The opt-in live suites burn real tokens and need network + credentials,
    // so the default `npm test` never runs them: the H8a programmatic suite and
    // the H9a non-interactive `pi -p` suite both live under `tests/live/**` and
    // share one runner (`npm run test:live` /
    // `config/vitest/vitest.live.config.ts`).
    exclude: [...configDefaults.exclude, "tests/live/**"],
    environment: "node",
  },
});
