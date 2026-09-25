import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["node_modules/**", "dist/**", "dist-electron/**", "dist-helper/**", "e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "./coverage",
      include: ["electron/**/*.ts", "shared/**/*.ts", "src/**/*.ts", "src/**/*.tsx"],
      exclude: [
        "**/*.d.ts",
        "**/*.test.ts",
        "**/types.ts",
        "electron/preload.ts",
        "src/main.tsx",
        "src/vite-env.d.ts"
      ],
      thresholds: {
        lines: 25,
        functions: 70,
        branches: 70,
        statements: 25
      }
    }
  }
});
