import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.js"],
    // Many files render the whole app; when they all run at once on a busy machine or a
    // cold CI runner, 5s is far too tight (a coverage run on a slow runner needs 30s+ for the heaviest files) and tests time out although nothing is wrong.
    testTimeout: 60000,
    hookTimeout: 60000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
    },
  },
})