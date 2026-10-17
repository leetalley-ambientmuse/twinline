import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "happy-dom",
    include: [
      "src/lib/audio/**/*.test.ts",
      "src/lib/prompt/**/*.test.ts",
      "src/lib/store.test.ts",
      "src/lib/brand.test.ts",
      "src/components/booth.test.tsx",
      "src/components/controls.test.tsx",
    ],
    testTimeout: 20000,
    setupFiles: ["./src/test-setup.ts"],
    coverage: {
      provider: "v8",
      include: [
        "src/lib/brand.ts",
        "src/lib/store.ts",
        "src/lib/audio/**/*.ts",
        "src/components/DeckPanel.tsx",
        "src/components/Mixer.tsx",
        "src/components/StepGrid.tsx",
        "src/components/SynthView.tsx",
        "src/components/Transport.tsx",
        "src/components/TwinlineApp.tsx",
        "src/components/controls.tsx",
        "src/components/rack-context.tsx",
      ],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
