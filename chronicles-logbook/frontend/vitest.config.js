import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.js"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
    },
  },
})