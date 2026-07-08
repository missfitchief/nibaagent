import type { NextConfig } from "next";

// Build stamp — evaluated once when the build runs. Commit comes from the
// deploy's --build-env NEXT_PUBLIC_COMMIT (or Vercel's git sha); build time is
// stamped here; env from Vercel.
const BUILD_TIME = new Date().toISOString();

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_TIME: BUILD_TIME,
    NEXT_PUBLIC_COMMIT: process.env.NEXT_PUBLIC_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA || "local",
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV || "development"
  },
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
