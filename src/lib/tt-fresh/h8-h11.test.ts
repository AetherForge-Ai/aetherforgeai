import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PROCESSORS, CONTACT_PAGE_EMAIL } from "@/lib/public-copy";

const read = (p: string) => readFileSync(p, "utf8");

describe("TT fresh H8 — /contact form", () => {
  it("has a form posting to the rate-limited /api/contact", () => {
    expect(read("src/app/contact/page.tsx")).toContain("<ContactForm />");
    expect(read("src/components/contact/ContactForm.tsx")).toContain('fetch("/api/contact"');
    expect(read("src/app/api/contact/route.ts")).toContain("takeRateLimit");
  });
  it("shows lukas@ once and no postal address or TODO", () => {
    expect(CONTACT_PAGE_EMAIL).toBe("lukas@aetherforgeai.co.nz");
    const page = read("src/app/contact/page.tsx");
    expect(page.match(/<EmailAddress/g)?.length).toBe(1);
    expect(page).not.toMatch(/TODO|Street|Road|PO Box/i);
  });
  it("legal pages that point to the contact form still link /contact", () => {
    for (const f of ["src/app/terms-of-service/page.tsx", "src/app/privacy-policy/page.tsx", "src/app/ai-disclaimer/page.tsx", "src/app/trust/page.tsx"]) {
      expect(read(f)).toContain('href="/contact"');
    }
  });
});

describe("TT fresh M13 — email printed once", () => {
  it("EmailAddress prints the address once as text", () => {
    // M-2: the address is plain text (split @ span) with a mailto set after hydration; no noscript copy needed.
    expect(read("src/components/EmailAddress.tsx")).toContain("<span>@</span>");
    expect(read("src/app/help/page.tsx")).not.toContain("(admin at aetherforgeai.co.nz)");
  });
});

describe("TT fresh H9 — processors", () => {
  it("names CoinCap, Binance and DexPaprika", () => {
    const names = PROCESSORS().map((p) => p.name);
    for (const n of ["CoinCap", "Binance", "DexPaprika"]) expect(names).toContain(n);
  });
});

describe("TT fresh H11 — 404", () => {
  it("heading uses a light colour on the dark page", () => {
    const page = read("src/app/not-found.tsx");
    expect(page).toContain('text-6xl font-bold text-white');
    expect(page).not.toContain("content-light");
  });
});
