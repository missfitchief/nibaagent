import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Server-only modules import "server-only"; alias it to a no-op for tests.
    alias: { "server-only": new URL("./test/server-only-stub.ts", import.meta.url).pathname },
    include: ["test/**/*.test.ts"],
    environment: "node",
    testTimeout: 30000,
    fileParallelism: false
  }
});
