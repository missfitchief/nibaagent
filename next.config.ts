import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native/WASM server-side packages must not be bundled: PGlite ships a WASM
  // blob whose path Turbopack would rewrite into a virtual /ROOT/ URL, and pg
  // uses optional native bindings.
  serverExternalPackages: ["@electric-sql/pglite", "pg", "bcryptjs"],
  // Bundle the SQL migration files into the one-time bootstrap route so it can
  // apply them at runtime on Vercel (where the integration DB URL is readable
  // but `vercel env pull` redacts it).
  outputFileTracingIncludes: {
    "/api/admin/bootstrap": ["./drizzle/**/*.sql"]
  }
};

export default nextConfig;
