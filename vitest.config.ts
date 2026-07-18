import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Server-only modules import "server-only"; alias it to a no-op for tests.
  // "@" mirrors tsconfig paths ("@/*" → "./src/*") so route handlers can be imported.
  // fileURLToPath (not .pathname) — .pathname percent-encodes spaces, breaking
  // on checkout paths that contain one.
  resolve: {
    alias: {
      "server-only": fileURLToPath(new URL("./test/server-only-stub.ts", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    testTimeout: 30000,
    fileParallelism: false
  }
});
