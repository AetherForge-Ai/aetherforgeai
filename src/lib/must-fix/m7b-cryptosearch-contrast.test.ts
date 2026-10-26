import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CRYPTO_SEARCH_BACKGROUNDS, CRYPTO_SEARCH_TEXT, contrastRatio, cryptoSearchPctClass } from "@/lib/crypto-search-colors";

describe("M-7b CryptoSearch option contrast", () => {
  it("every text colour is at least 4.5:1 on normal and highlighted rows, in both themes", () => {
    for (const [kind, t] of Object.entries(CRYPTO_SEARCH_TEXT)) {
      for (const bg of CRYPTO_SEARCH_BACKGROUNDS.light) expect(contrastRatio(t.light, bg), `${kind} light on ${bg}`).toBeGreaterThanOrEqual(4.5);
      for (const bg of CRYPTO_SEARCH_BACKGROUNDS.dark) expect(contrastRatio(t.dark, bg), `${kind} dark on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("the old rose-600 fails on the highlighted row (regression guard)", () => {
    expect(contrastRatio("#e11d48", "#ecfdf5")).toBeLessThan(4.5);
  });
  it("backgrounds match globals.css tokens", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toContain("--accent: #ecfdf5");
    expect(css).toContain("--accent: #134e4a");
    expect(css).toContain("--popover: #1e293b");
  });
  it("maps gains, losses and flat values, and CryptoSearch no longer uses rose-600", () => {
    expect(cryptoSearchPctClass(-0.81)).toContain("text-rose-700");
    expect(cryptoSearchPctClass(1.2)).toContain("text-emerald-700");
    expect(cryptoSearchPctClass(0)).toContain("text-slate-600");
    const src = readFileSync("src/components/dashboard/CryptoSearch.tsx", "utf8");
    expect(src).toContain("cryptoSearchPctClass(c.change24h)");
    expect(src).not.toMatch(/rose-600|pctColor\(/);
  });
});
