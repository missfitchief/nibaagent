/**
 * Build/version info surfaced in the admin UI and at /api/version so a deploy
 * can be verified at a glance. Values are inlined at build time via
 * next.config env (NEXT_PUBLIC_COMMIT from the deploy's --build-env or
 * VERCEL_GIT_COMMIT_SHA; NEXT_PUBLIC_BUILD_TIME stamped when the build runs).
 */
export const VERSION = {
  commit: process.env.NEXT_PUBLIC_COMMIT || "local",
  buildTime: process.env.NEXT_PUBLIC_BUILD_TIME || "unknown",
  env: process.env.NEXT_PUBLIC_VERCEL_ENV || "development"
};
