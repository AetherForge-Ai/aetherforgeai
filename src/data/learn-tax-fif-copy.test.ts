import { describe, expect, it } from "vitest";
import { FIF_METHOD_SWITCH_RULE, GUIDES } from "@/data/learn-content";

const guide = (slug: string) => {
  const found = GUIDES.find((item) => item.slug === slug);
  if (!found) throw new Error(`missing guide ${slug}`);
  return found;
};

/** Title, description, intro and facts: the text a reader sees on the guide. */
function pageText(slug: string): string {
  const item = guide(slug);
  return [item.title, item.description, item.intro, ...item.facts.map((fact) => fact.text)].join("\n");
}

describe("tax and FIF learn copy", () => {
  it("formats every money value on the two tax guides as NZ$ with 2 decimal places", () => {
    for (const slug of ["nz-income-tax-rates", "foreign-dividends-200-threshold"]) {
      const text = pageText(slug);
      expect(text).not.toMatch(/(?<![A-Za-z])\$/);
      const amounts = text.match(/NZ\$[\d,]+(?:\.\d+)?/g) ?? [];
      expect(amounts.length).toBeGreaterThan(0);
      for (const amount of amounts) expect(amount).toMatch(/^NZ\$[\d,]+\.\d{2}$/);
    }
    expect(pageText("nz-income-tax-rates")).toContain("NZ$15,600.00");
    expect(pageText("foreign-dividends-200-threshold")).toContain("NZ$200.00");
  });

  it("states one FIF switching rule on both FIF guides", () => {
    const fdr = guide("fif-fdr-vs-cv");
    const methods = guide("fif-six-methods");
    expect(fdr.facts.map((fact) => fact.text)).toContain(FIF_METHOD_SWITCH_RULE);
    expect(methods.facts.map((fact) => fact.text)).toContain(FIF_METHOD_SWITCH_RULE);
    expect(fdr.facts.filter((fact) => fact.text === FIF_METHOD_SWITCH_RULE)).toHaveLength(1);
    expect(methods.facts.filter((fact) => fact.text === FIF_METHOD_SWITCH_RULE)).toHaveLength(1);
    const combined = `${fdr.intro}\n${pageText("fif-fdr-vs-cv")}\n${pageText("fif-six-methods")}`;
    expect(combined).not.toMatch(/choose a different applicable method each year/i);
    expect(combined).toMatch(/not within the same income year/);
    expect(combined).toMatch(/deemed rate of return method can be used only for a non-ordinary share/);
  });
});
