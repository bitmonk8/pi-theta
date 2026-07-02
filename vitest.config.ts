import { defineConfig } from "vitest/config";
import { configDefaults } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    // The opt-in live-host acceptance suite (H8a-T) burns real tokens and needs
    // network + credentials, so the default `npm test` never runs it; it has its
    // own runner (`npm run test:live` / `vitest.live.config.ts`).
    exclude: [...configDefaults.exclude, "tests/live/**"],
    environment: "node",
  },
});
