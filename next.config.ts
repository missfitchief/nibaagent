import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native/WASM server-side packages must not be bundled: PGlite ships a WASM
  // blob whose path Turbopack would rewrite into a virtual /ROOT/ URL, and pg
  // uses optional native bindings.
  serverExternalPackages: ["@electric-sql/pglite", "pg", "bcryptjs"]
};

export default nextConfig;
