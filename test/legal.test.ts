import { describe, it, expect } from "vitest";
import { LEGAL_DOCS, PRIVACY, TERMS, DATA_DELETION } from "../src/lib/legal";

describe("legal documents", () => {
  it("exposes the three required docs at the expected slugs", () => {
    expect(Object.keys(LEGAL_DOCS)).toEqual(["privacy-policy", "terms-of-service", "user-data-deletion"]);
    expect(PRIVACY.slug).toBe("privacy-policy");
    expect(TERMS.slug).toBe("terms-of-service");
    expect(DATA_DELETION.slug).toBe("user-data-deletion");
  });

  it("each doc has a title, meta title, description, date and non-trivial body", () => {
    for (const doc of Object.values(LEGAL_DOCS)) {
      expect(doc.metaTitle).toContain("NibaChat Agent");
      expect(doc.description.length).toBeGreaterThan(20);
      expect(doc.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(doc.body.length).toBeGreaterThan(8);
    }
  });

  it("privacy + terms point users to the deletion page and support email", () => {
    const flat = (d: typeof PRIVACY) => JSON.stringify(d.body);
    expect(flat(PRIVACY)).toContain("https://nibaagent.vercel.app/user-data-deletion");
    expect(flat(PRIVACY)).toContain("support@nibachat.app");
    expect(flat(TERMS)).toContain("support@nibachat.app");
    expect(flat(DATA_DELETION)).toContain("support@nibachat.app");
  });

  it("names the legal entity and jurisdiction", () => {
    const flat = JSON.stringify(Object.values(LEGAL_DOCS).map((d) => d.body));
    expect(flat).toContain("Legal entity: Aladdin21");
    expect(flat).toContain("Jurisdiction: United States");
    expect(flat).toContain("governed by the laws of the United States");
  });
});
