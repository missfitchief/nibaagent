import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";

/**
 * scripts/migrate.ts must refuse to run against the silent PGlite fallback in
 * production (or on Vercel) when DATABASE_URL is missing — otherwise a deploy
 * "succeeds" without ever migrating the real database.
 */

const ROOT = path.resolve(__dirname, "..");

function runMigrate(overrides: { NODE_ENV?: string; DATABASE_URL?: string; VERCEL?: string }) {
  const env = {
    ...process.env,
    ...Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== undefined))
  };
  // Fully controlled below — never inherited from the test runner.
  if (overrides.DATABASE_URL === undefined) delete env.DATABASE_URL;
  if (overrides.VERCEL === undefined) delete env.VERCEL;
  return spawnSync("npx", ["tsx", "scripts/migrate.ts"], {
    cwd: ROOT,
    env,
    encoding: "utf8",
    timeout: 60_000
  });
}

describe("migrate script production guard", () => {
  it("exits 1 in production without DATABASE_URL", () => {
    const r = runMigrate({ NODE_ENV: "production" });
    expect(r.status).toBe(1);
    expect(`${r.stdout}${r.stderr}`).toContain("DATABASE_URL is required in production");
  });

  it("exits 1 on Vercel without DATABASE_URL even outside NODE_ENV=production", () => {
    const r = runMigrate({ NODE_ENV: "development", VERCEL: "1" });
    expect(r.status).toBe(1);
    expect(`${r.stdout}${r.stderr}`).toContain("DATABASE_URL is required in production");
  });

  it("runs against the local PGlite fallback in development", () => {
    const r = runMigrate({ NODE_ENV: "development" });
    expect(r.status).toBe(0);
    expect(`${r.stdout}${r.stderr}`).toContain("migrations up to date");
  });
});
