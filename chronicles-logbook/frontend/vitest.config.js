import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.js"],
    // Many files render the whole app; when they all run at once on a busy machine or a
    // cold CI runner, 5s is too tight and tests time out although nothing is wrong.
    testTimeout: 20000,
    hookTimeout: 20000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
    },
  },
})