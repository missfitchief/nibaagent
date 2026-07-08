import { describe, it, expect } from "vitest";
import { classifyPage, extractReadableText, pageTitle } from "../src/lib/website";

describe("website knowledge parsers (pure)", () => {
  it("classifyPage by URL path", () => {
    expect(classifyPage("https://x/o-nama", "")).toBe("about");
    expect(classifyPage("https://x/faq", "")).toBe("faq");
    expect(classifyPage("https://x/dostava", "")).toBe("delivery");
    expect(classifyPage("https://x/nacini-placanja", "")).toBe("payment");
    expect(classifyPage("https://x/reklamacije", "")).toBe("returns");
    expect(classifyPage("https://x/kontakt", "")).toBe("contact");
    expect(classifyPage("https://x/", "")).toBe("website");
  });

  it("classifyPage by content keywords when path is generic", () => {
    expect(classifyPage("https://x/page1", "Dostava se vrši kurirskom službom.")).toBe("delivery");
    expect(classifyPage("https://x/page2", "Kontaktirajte nas na broj...")).toBe("contact");
  });

  it("extractReadableText strips scripts/styles/nav and collapses whitespace", () => {
    const html = `<html><head><style>.x{color:red}</style></head>
      <body><nav>menu menu</nav><main>  Hello   <b>world</b>.  </main>
      <script>var a=1;</script><footer>footer stuff</footer></body></html>`;
    const text = extractReadableText(html);
    expect(text).toContain("Hello");
    expect(text).toContain("world");
    expect(text).not.toContain("menu menu");
    expect(text).not.toContain("var a=1");
    expect(text).not.toContain("footer stuff");
  });

  it("pageTitle reads <title> with fallback", () => {
    expect(pageTitle("<title>Shop — About</title>", "x")).toBe("Shop — About");
    expect(pageTitle("<html></html>", "Homepage")).toBe("Homepage");
  });
});
