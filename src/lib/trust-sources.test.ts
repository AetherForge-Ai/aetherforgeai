import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { publicDataSourcesLine } from "@/lib/data-sources";
import { PROCESSORS } from "@/lib/public-copy";

function read(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("M8 trust and privacy sources", () => {
  afterEach(() => {
    delete process.env.SWYFTX_PUBLIC_DISPLAY;
  });

  it("lists GeckoTerminal and does not claim licensed data or subscribed briefings", () => {
    delete process.env.SWYFTX_PUBLIC_DISPLAY;
    const processors = PROCESSORS();
    expect(processors.some((processor) => processor.name === "GeckoTerminal")).toBe(true);
    expect(processors.some((processor) => processor.name === "Kraken")).toBe(true);
    expect(processors.some((processor) => processor.name === "Coinbase")).toBe(true);
    expect(processors.some((processor) => processor.name === "Swyftx")).toBe(false);
    const trust = read("src/app/trust/page.tsx");
    const privacy = read("src/app/privacy-policy/page.tsx");
    expect(trust).toContain("PROCESSORS");
    expect(privacy).toContain("PROCESSORS");
    expect(privacy).toContain("GeckoTerminal");
    const blob = [trust, privacy, publicDataSourcesLine(), ...processors.map((processor) => `${processor.name} ${processor.role}`)].join(
      "\n",
    );
    expect(blob).not.toMatch(/licensed market data/i);
    expect(blob).not.toMatch(/daily briefings you have subscribed to/i);
    expect(blob).not.toMatch(/swyftx/i);
    expect(publicDataSourcesLine()).toContain("public market data (Yahoo Finance)");
    expect(publicDataSourcesLine()).toContain("GeckoTerminal");
  });
});
