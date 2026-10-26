// pull-check:v3-fix-b76-2026-10-27
/** b74 (27 Oct 2026): M-7 "one green for text" — up/down deltas use the text-gain token and an AA red. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pctColor } from "@/lib/crypto-market";

const read = (p: string) => readFileSync(p, "utf8");

describe("b74 M-7 one green for text", () => {
  it("pctColor uses text-gain up, an AA red down, muted flat", () => {
    expect(pctColor(1.2)).toBe("text-gain");
    expect(pctColor(-0.4)).toBe("text-rose-600");
    expect(pctColor(0)).toBe("text-muted-foreground");
    expect(pctColor(null)).toBe("text-muted-foreground");
  });

  it("no low-contrast emerald-400 / rose-400 delta class is left", () => {
    expect(read("src/lib/crypto-market.ts")).not.toMatch(/text-emerald-400|text-rose-400/);
  });

  it("the ticker's up chip uses the token (dark strip swaps it to an AA value)", () => {
    expect(read("src/components/MarketTicker.tsx")).toContain('up ? "bg-emerald-500/20 text-gain"');
    const css = read("src/app/globals.css");
    expect(css).toMatch(/\.bg-zinc-950,\s*\.chrome-dark\s*\{\s*--text-green:\s*#34d399/);
  });

  it("pins the build", () => {
    expect(read("public/build-version.txt").trim()).toBe("v3-fix-b76-2026-10-27");
  });
});
