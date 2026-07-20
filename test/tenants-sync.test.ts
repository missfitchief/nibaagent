import { describe, expect, it } from "vitest";
import { safeReturnUrl } from "../src/lib/tenant";

describe("safeReturnUrl (fixes post-connect business jump / open redirect)", () => {
  const fb = "/admin/businesses/abc?tab=channels";
  it("accepts same-origin /app and /admin paths", () => {
    expect(safeReturnUrl("/app/connect", fb)).toBe("/app/connect");
    expect(safeReturnUrl("/admin/businesses/xyz?tab=channels", fb)).toBe("/admin/businesses/xyz?tab=channels");
  });
  it("rejects external / protocol-relative / traversal / other paths → fallback", () => {
    expect(safeReturnUrl("https://evil.com", fb)).toBe(fb);
    expect(safeReturnUrl("//evil.com", fb)).toBe(fb);
    expect(safeReturnUrl("/etc/passwd", fb)).toBe(fb);
    expect(safeReturnUrl("/login", fb)).toBe(fb);
    expect(safeReturnUrl("", fb)).toBe(fb);
    expect(safeReturnUrl(null, fb)).toBe(fb);
    expect(safeReturnUrl("/app//x", fb)).toBe(fb); // no double slash
  });
});
