import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Until now the web package ran vitest with no config at all. That worked only
 * because every test was plain `.ts`: `tsconfig.json` sets `jsx: "preserve"`
 * for Next, so esbuild left JSX untransformed and any `.tsx` test failed with
 * `ReferenceError: React is not defined`. Component behaviour was therefore
 * untestable. Two settings fix that.
 */
export default defineConfig({
  // Next applies the automatic JSX runtime itself; vitest needs telling.
  esbuild: { jsx: "automatic" },
  resolve: {
    // Mirror the `@/*` path mapping from tsconfig.json.
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules/**", ".next/**", "app/screen/_prototype-3d/**"],
    // Node, not jsdom: jsdom is not a dependency. Component tests render with
    // `react-dom/server`, which asserts markup and semantics without a DOM.
    // Anything needing real events or layout would need jsdom added first.
    environment: "node",
  },
});
