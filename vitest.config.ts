import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.ts"],
    environment: "node",
    setupFiles: ["dotenv/config"],
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
});
