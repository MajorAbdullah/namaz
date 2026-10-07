import preact from "@preact/preset-vite";
import { defineConfig } from "vitest/config";

// Tauri serves the built files, and in development expects the dev server on a fixed port.
export default defineConfig({
  plugins: [preact()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { target: "chrome105", outDir: "dist", emptyOutDir: true },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
