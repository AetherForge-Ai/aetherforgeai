import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { AI_REQUEST_LINES } from "@/lib/public-copy";

describe("TT fresh M15–M16", () => {
  it("no internal code notes in public copy", () => {
    expect(AI_REQUEST_LINES.join(" ")).not.toMatch(/the code that sends/i);
    expect(readFileSync("src/lib/trust-facts.ts", "utf8")).not.toContain("taken from the code");
    expect(readFileSync("src/lib/tax-realised.ts", "utf8")).not.toContain("A USD rate below 1 is flipped");
  });
  it("NZ$50,000 everywhere on FIF", () => {
    for (const f of ["src/app/tax/fif/page.tsx", "src/lib/fif-working-paper.ts"]) {
      expect(readFileSync(f, "utf8")).not.toMatch(/(?<!NZ)\$50,000/);
    }
  });
  it("/about market wording matches its heading", () => {
    const s = readFileSync("src/components/about/AboutContent.tsx", "utf8");
    expect(s).not.toContain("Not a generic global screener");
    expect(s).toContain("NZX and ASX listings, major US stocks, crypto and precious metals");
  });
});
