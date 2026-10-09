import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    // PGlite boots a WASM Postgres per test file; slow under parallel load and coverage
    hookTimeout: 60_000,
    testTimeout: 30_000,
    include: ["src/**/*.test.ts"],
    passWithNoTests: true,
    coverage: { provider: "v8", include: ["src/domain/**", "src/server/**"] },
  },
});
