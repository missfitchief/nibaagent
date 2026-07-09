import { describe, it, expect, beforeAll } from "vitest";
import { makeDb, type TestDb } from "./helpers";
import { getDict, LOCALES, isLocale } from "../src/lib/i18n";
import { postsFor, getPost, BLOG_POSTS_SR } from "../src/lib/blog";
import { setPlatform } from "../src/lib/platform";
import { metaConfigCheck } from "../src/lib/meta-check";
import { resetEnvCache } from "../src/lib/env";

describe("i18n dictionary (sr/bs/en + fallback)", () => {
  it("has all three locales with localized nav + hero", () => {
    expect([...LOCALES]).toEqual(["sr", "bs", "en"]);
    expect(getDict("sr").nav.blog).toBe("Blog");
    expect(getDict("en").hero.ctaPrimary).toBe("Start free");
    expect(getDict("sr").hero.ctaPrimary).toBe("Pokreni besplatno");
  });

  it("fixes the flagged status wording", () => {
    // the audit called out "Kupac odgovoren" — must be natural now
    expect(getDict("sr").demo.chips[0]).toBe("Odgovoreno kupcu");
    expect(getDict("sr").demo.chips.join(" ")).not.toContain("Kupac odgovoren");
  });

  it("Bosnian overrides ijekavica but falls back to Serbian for un-overridden keys", () => {
    const bs = getDict("bs");
    expect(bs.hero.caps[1]).toBe("Prima narudžbe"); // bs override
    expect(bs.pricing.unitMessages).toContain("mjesec"); // bs ijekavica
    // eyebrow not overridden in bs → falls back to sr value
    expect(bs.product.eyebrow).toBe(getDict("sr").product.eyebrow);
  });

  it("isLocale guards", () => {
    expect(isLocale("sr")).toBe(true);
    expect(isLocale("bs")).toBe(true);
    expect(isLocale("hr")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});

describe("blog", () => {
  it("Serbian articles exist and are returned for sr/bs", () => {
    expect(BLOG_POSTS_SR.length).toBeGreaterThanOrEqual(5);
    const sr = postsFor("sr");
    const bs = postsFor("bs");
    expect(sr.every((p) => p.lang === "sr")).toBe(true);
    expect(bs).toEqual(sr); // bs falls back to sr articles
    expect(sr.some((p) => p.slug === "ai-chatbot-za-instagram-prodaju")).toBe(true);
  });
  it("English locale returns English legacy posts", () => {
    const en = postsFor("en");
    expect(en.length).toBeGreaterThan(0);
    expect(en.every((p) => (p.lang ?? "en") === "en")).toBe(true);
  });
  it("getPost finds both sr and en posts", () => {
    expect(getPost("ai-chatbot-za-instagram-prodaju")?.lang).toBe("sr");
    expect(getPost("why-fast-replies-increase-sales")).toBeTruthy();
    expect(getPost("nope-does-not-exist")).toBeUndefined();
  });
});

describe("meta config check (DB → env)", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await makeDb();
    void db;
    process.env.APP_URL = "https://nibaagent.example";
    resetEnvCache();
  });

  it("not ready when nothing configured", async () => {
    const c = await metaConfigCheck();
    expect(c.ready).toBe(false);
    // callback URL still derives from APP_URL env
    expect(c.callbackUrl).toBe("https://nibaagent.example/api/meta/callback");
    expect(c.webhookUrl).toBe("https://nibaagent.example/api/meta/webhook");
  });

  it("becomes ready when App ID + Secret are set in DB, and marks the source", async () => {
    await setPlatform("META_APP_ID", "2199807407438226");
    await setPlatform("META_APP_SECRET", "shh-secret-value");
    const c = await metaConfigCheck();
    expect(c.ready).toBe(true);
    const appId = c.items.find((i) => i.key === "META_APP_ID")!;
    expect(appId.set).toBe(true);
    expect(appId.source).toBe("db");
    expect(appId.value).toBe("2199807407438226");
    // secret never returns its value
    const secret = c.items.find((i) => i.key === "META_APP_SECRET")!;
    expect(secret.set).toBe(true);
    expect((secret as { value?: string }).value).toBeUndefined();
  });
});
