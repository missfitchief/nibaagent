import { describe, it, expect } from "vitest";
import { sanitizeModel, pickModel, isProvider, APP_DEFAULT_MODEL } from "../src/lib/models";
import { withinBusinessHours } from "../src/lib/hours";

describe("model config (no hard allow-list)", () => {
  it("sanitizeModel trims and rejects junk but keeps vendor-style names", () => {
    expect(sanitizeModel("  gpt-4o-mini ")).toBe("gpt-4o-mini");
    expect(sanitizeModel("claude-3-5-sonnet-latest")).toBe("claude-3-5-sonnet-latest");
    expect(sanitizeModel("anthropic/claude-x")).toBe("anthropic/claude-x");
    expect(sanitizeModel("")).toBe("");
    expect(sanitizeModel("bad name with spaces")).toBe("");
    expect(sanitizeModel("x".repeat(200))).toBe("");
  });

  it("accepts unknown / future model names (pass-through)", () => {
    expect(pickModel({ provider: "openai", businessModel: "gpt-5-turbo-2027" })).toBe("gpt-5-turbo-2027");
    expect(pickModel({ provider: "anthropic", businessModel: "claude-opus-9" })).toBe("claude-opus-9");
  });

  it("resolution order: business → platform → app default", () => {
    expect(pickModel({ provider: "openai", businessModel: "biz-model" })).toBe("biz-model");
    expect(pickModel({ provider: "openai", businessModel: "", platformDefault: "plat-model" })).toBe("plat-model");
    expect(pickModel({ provider: "openai", businessModel: "", platformDefault: "" })).toBe(APP_DEFAULT_MODEL.openai);
    expect(pickModel({ provider: "anthropic", businessModel: null, platformDefault: null })).toBe(APP_DEFAULT_MODEL.anthropic);
  });

  it("isProvider guards the enum", () => {
    expect(isProvider("openai")).toBe(true);
    expect(isProvider("anthropic")).toBe(true);
    expect(isProvider("cohere")).toBe(false);
    expect(isProvider(undefined)).toBe(false);
  });
});

describe("business hours", () => {
  const at = (h: number, day = 1) => new Date(2026, 6, 6 + ((day - 1) % 7), h, 0, 0); // Mon=1 baseline

  it("disabled → always open", () => {
    expect(withinBusinessHours({ enabled: false }, at(3))).toBe(true);
  });
  it("simple window 9–21", () => {
    const h = { enabled: true, openHour: 9, closeHour: 21 };
    expect(withinBusinessHours(h, at(8))).toBe(false);
    expect(withinBusinessHours(h, at(9))).toBe(true);
    expect(withinBusinessHours(h, at(20))).toBe(true);
    expect(withinBusinessHours(h, at(21))).toBe(false);
  });
  it("window wrapping past midnight 20→6", () => {
    const h = { enabled: true, openHour: 20, closeHour: 6 };
    expect(withinBusinessHours(h, at(22))).toBe(true);
    expect(withinBusinessHours(h, at(3))).toBe(true);
    expect(withinBusinessHours(h, at(10))).toBe(false);
  });
  it("day mask restricts weekdays", () => {
    const sunday = new Date(2026, 6, 5, 12, 0, 0); // 2026-07-05 is a Sunday
    expect(sunday.getDay()).toBe(0);
    const h = { enabled: true, openHour: 0, closeHour: 24, days: [1, 2, 3, 4, 5] };
    expect(withinBusinessHours(h, sunday)).toBe(false);
  });
});
