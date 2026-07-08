import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { makeDb, type TestDb } from "./helpers";
import * as schema from "../src/lib/db/schema";
import { resolvePlatform, setPlatform, deletePlatform, platformOverview } from "../src/lib/platform";
import { resetEnvCache } from "../src/lib/env";

describe("platform settings (DB over env, encrypted secrets, masked view)", () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await makeDb();
    process.env.META_APP_ID = "env-app-id";
    process.env.META_APP_SECRET = "env-app-secret";
    resetEnvCache();
  });

  it("falls back to env when no DB row", async () => {
    const r = await resolvePlatform("META_APP_ID");
    expect(r.source).toBe("env");
    expect(r.value).toBe("env-app-id");
  });

  it("DB value overrides env", async () => {
    await setPlatform("META_APP_ID", "db-app-id");
    const r = await resolvePlatform("META_APP_ID");
    expect(r.source).toBe("db");
    expect(r.value).toBe("db-app-id");
  });

  it("secrets are encrypted at rest but resolve to plaintext server-side", async () => {
    await setPlatform("META_APP_SECRET", "topsecret1234");
    const row = (await db.select().from(schema.platformSettings).where(eq(schema.platformSettings.key, "META_APP_SECRET")))[0];
    expect(row.value).not.toContain("topsecret1234");
    expect(row.value.startsWith("v1:")).toBe(true); // AES-GCM wire format
    expect(row.lastFour).toBe("1234");

    const r = await resolvePlatform("META_APP_SECRET");
    expect(r.source).toBe("db");
    expect(r.value).toBe("topsecret1234");
  });

  it("platformOverview never leaks secret plaintext (masked only)", async () => {
    const view = await platformOverview();
    const secretRow = view.find((v) => v.key === "META_APP_SECRET")!;
    expect(secretRow.secret).toBe(true);
    expect(secretRow.display).toBe("…1234");
    expect(secretRow.display).not.toContain("topsecret");

    const appId = view.find((v) => v.key === "META_APP_ID")!;
    expect(appId.secret).toBe(false);
    expect(appId.display).toBe("db-app-id"); // non-secret shown plainly
  });

  it("verify token resolves from DB (used by the webhook GET handshake)", async () => {
    await setPlatform("META_VERIFY_TOKEN", "verify-xyz");
    expect((await resolvePlatform("META_VERIFY_TOKEN")).value).toBe("verify-xyz");
  });

  it("deleting a DB setting falls back to env again", async () => {
    await deletePlatform("META_APP_ID");
    const r = await resolvePlatform("META_APP_ID");
    expect(r.source).toBe("env");
    expect(r.value).toBe("env-app-id");
  });
});
