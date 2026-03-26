import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "forks",
    environment: "node",
    testTimeout: 30000,
    hookTimeout: 60000,
    allowOnly: !process.env.CI,
    include: ["tests/**/*.test.ts"],
  },
});
