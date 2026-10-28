// pull-check:v3-b90-2026-10-29
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { taxSalePreviewEnabled } from "@/lib/feature-flags";
const read = (p: string) => readFileSync(p, "utf8");
describe("b79 G-18 sale preview is gated", () => {
  it("flag off by default", () => {
    expect(taxSalePreviewEnabled({})).toBe(false);
  });
  it("page 404s when the flag is off and carries the indicative label", () => {
    const src = read("src/app/tax/sale-preview/page.tsx");
    expect(src).toMatch(/if \(!taxSalePreviewEnabled\(\)\) notFound\(\)/);
    expect(src).toContain("TAX_INDICATIVE_LABEL");
    expect(src).not.toMatch(/\bGST\b/);
  });
  it("no link to the preview from the rest of the app", () => {
    for (const f of ["src/components/tax/TaxSectionNav.tsx", "src/app/tax/realised/page.tsx"]) expect(read(f)).not.toContain("sale-preview");
  });
  it("flag is not set in deploy config", () => {
    for (const f of ["wrangler.jsonc", "wrangler.toml", ".env.production"]) {
      try { expect(read(f)).not.toContain("TAX_SALE_PREVIEW"); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
    }
  });
});
