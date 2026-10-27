/**
 * b85 batch 1. pull-check:v3-b85-2026-10-28
 * Worked NZ examples are hand-checked; indicative, not tax advice. No GST.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sourceLabel } from "@/lib/crypto-price-chain";
import { publicCoinSourceLine } from "@/lib/data-sources";
import { AI_DISCLAIMER_DATA_SENTENCE, AI_PROVIDER_API_SENTENCE } from "@/lib/ai-provider-disclosure";
import { AI_REQUEST_LINES } from "@/lib/public-copy";

const read = (p: string) => readFileSync(p, "utf8");

describe("b85 pins", () => {
  it("pins the build", () => {
    expect(read("public/build-version.txt").trim()).toBe("v3-b85-2026-10-28");
    expect(read("qa/PULL-CHECK-2026-10-12.md")).toContain("pull-check:v3-b85-2026-10-28");
  });
});

describe("b85 (a) polish", () => {
  it("names CoinPaprika in the source line", () => {
    expect(sourceLabel("coinpaprika")).toBe("CoinPaprika");
    expect(publicCoinSourceLine("coinpaprika,yahoo,coingecko")).toBe("Price source: CoinPaprika, Yahoo Finance, CoinGecko. Quotes can be delayed.");
  });
  it("/settings offers one next step only, never legacy plans", () => {
    const s = read("src/components/settings/SettingsClient.tsx");
    expect(s).toContain('p.key === `pro_${nextIntervalSuffix}`');
    expect(s).toContain('currentTier === "pro"');
    expect(s).not.toContain('(p.priceId || p.key.startsWith("starter_") || p.key.startsWith("pro_"))');
  });
  it("skip link and footer links are 44px on phones", () => {
    expect(read("src/app/layout.tsx")).toMatch(/inline-flex min-h-11 items-center[^"]*"[\s\S]{0,40}Skip to content/);
    expect(read("src/components/SiteFooter.tsx")).toContain("md:min-h-0 min-w-11 justify-center md:min-w-0");
  });
});

describe("b85 K-12: each AI disclosure sentence on both pages, plain visible text", () => {
  const trust = read("src/app/trust/page.tsx");
  const ai = read("src/app/ai-disclaimer/page.tsx");
  it("API and data sentences on both", () => {
    for (const page of [trust, ai]) {
      expect(page).toContain("{AI_PROVIDER_API_SENTENCE}");
      expect(page).toContain("{AI_DISCLAIMER_DATA_SENTENCE}");
      expect(page).toContain("AI_REQUEST_LINES.map");
      expect(page).not.toMatch(/<details|CollapsibleSection/);
    }
  });
  it("sentences use straight quotes only", () => {
    for (const s of [AI_PROVIDER_API_SENTENCE, AI_DISCLAIMER_DATA_SENTENCE, ...AI_REQUEST_LINES]) expect(s).not.toMatch(/[\u2018\u2019\u201c\u201d]/);
  });
});

describe("b85 BS-01 IBKR preview (fixture only)", () => {
  it("GET preview on the allow-listed hook, no write, no token, no new cron file", () => {
    const r = read("src/app/api/test-hooks/ibkr-fixture-sync/route.ts");
    expect(r).toContain("export async function GET()");
    expect(r).toContain('action: "preview"');
    expect(r).toContain("testHooksAllowedFor");
    expect(r.split("export async function GET()")[1]).not.toContain("applyFlexStatement");
  });
});

describe("b85 H-10 Sharesies and Hatch fixtures + preview paths", () => {
  const dir = "src/lib/fixtures/broker-import/";
  it("each broker has a fixture and an expected.json matching expected-totals.json", () => {
    const totals = JSON.parse(readFileSync(dir + "expected-totals.json", "utf8"));
    for (const b of ["sharesies", "hatch"]) {
      expect(readFileSync(dir + `${b}.csv`, "utf8").length).toBeGreaterThan(0);
      const exp = JSON.parse(readFileSync(dir + `${b}.expected.json`, "utf8"));
      expect({ broker: exp.broker, rows: exp.rows, cashNzd: exp.cashNzd }).toEqual(totals[`${b}.csv`]);
    }
    expect(totals["bad-rows.csv"].errors).toBe(3);
  });
  it("embedded preview fixtures equal the csv files", async () => {
    const m = await import("@/lib/fixtures/broker-import/preview-fixtures");
    expect(m.SHARESIES_FIXTURE).toBe(readFileSync(dir + "sharesies.csv", "utf8"));
    expect(m.HATCH_FIXTURE).toBe(readFileSync(dir + "hatch.csv", "utf8"));
    expect(m.BAD_ROWS_FIXTURE).toBe(readFileSync(dir + "bad-rows.csv", "utf8"));
  });
  it("preview hook is allow-listed, preview-only and covers oversize + bad-rows", () => {
    const src = readFileSync("src/app/api/test-hooks/import-preview/route.ts", "utf8");
    expect(src).toContain("testHooksAllowedFor");
    expect(src).toContain('action: "preview"');
    expect(src).toMatch(/oversize: \(\) =>/);
    expect(src).toContain('"bad-rows"');
    expect(src).not.toMatch(/Math\.random|createItem|\.create\(/);
  });
});
