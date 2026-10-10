import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PUBLIC_DATA_SOURCES_LINE } from "@/lib/data-sources";
import { PROCESSORS } from "@/lib/public-copy";

function read(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("M8 trust and privacy sources", () => {
  it("lists GeckoTerminal and does not claim licensed data or subscribed briefings", () => {
    expect(PROCESSORS.some((processor) => processor.name === "GeckoTerminal")).toBe(true);
    const trust = read("src/app/trust/page.tsx");
    const privacy = read("src/app/privacy-policy/page.tsx");
    expect(trust).toContain("PROCESSORS");
    expect(privacy).toContain("PROCESSORS");
    expect(privacy).toContain("GeckoTerminal");
    const blob = [trust, privacy, PUBLIC_DATA_SOURCES_LINE, ...PROCESSORS.map((processor) => `${processor.name} ${processor.role}`)].join(
      "\n",
    );
    expect(blob).not.toMatch(/licensed market data/i);
    expect(blob).not.toMatch(/daily briefings you have subscribed to/i);
    expect(PUBLIC_DATA_SOURCES_LINE).toContain("public market data (Yahoo Finance)");
    expect(PUBLIC_DATA_SOURCES_LINE).toContain("GeckoTerminal");
  });
});
