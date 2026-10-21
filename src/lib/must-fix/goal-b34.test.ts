// pull-check:v3-goal-b34-2026-10-19
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { filterServableNews } from "@/lib/news-serve";

describe("b34 H-13: /market-news and /api/news serve only NZ/AU items on every path", () => {
  it("a Yahoo Finance Global item is dropped even when it mentions New Zealand", () => {
    const items = [
      { headline: "Wall Street rallies; New Zealand dollar firms", market: "Global", source: "Yahoo Finance" },
      { headline: "Fisher & Paykel Healthcare lifts guidance", market: "NZX", source: "RNZ" },
    ];
    const out = filterServableNews(items as never);
    expect(out.every((i: { market: string }) => i.market !== "Global")).toBe(true);
  });
  it("the page and the API use the same filter", async () => {
    const { readFileSync } = await import("node:fs");
    expect(readFileSync("src/app/market-news/page.tsx", "utf8")).toMatch(/filterServableNews\(await loadMarketNews\("stock"\)\)/);
    expect(readFileSync("src/app/api/news/route.ts", "utf8")).toMatch(/filterServableNews\(await loadMarketNews\("stock"\)\)/);
  });
});

import { readFileSync } from "node:fs";
import { previewImport } from "@/lib/import/plan";
import { workbookToCsv } from "@/lib/import/xlsx";
import { savedSnapshotLabel } from "@/lib/status-feeds";

const fx = (f: string) => readFileSync(`src/lib/import/fixtures/${f}`, "utf8");
const swyftxRates = JSON.parse(fx("expected.json"))["swyftx.csv"].rates;

describe("b34 H-10 (Research BROKER-CSV-COLUMNS.md): real fixture set", () => {
  it("Swyftx variant 2 (no tax columns) previews like variant 1", async () => {
    const a = await previewImport(fx("swyftx.csv"), { reviewedRates: swyftxRates });
    const b = await previewImport(fx("swyftx-no-tax.csv"), { reviewedRates: swyftxRates });
    expect(b.broker).toBe("swyftx");
    expect(b.toWrite.length).toBe(a.toWrite.length);
    expect(b.cashNzd).toBe(a.cashNzd);
  });
  it("IBKR matches on header names: reordered columns, Description missing", async () => {
    const a = await previewImport(fx("ibkr.csv"));
    const b = await previewImport(fx("ibkr-reordered.csv"));
    expect(b.broker).toBe("ibkr");
    expect(b.toWrite.length).toBe(3);
    expect(Math.abs(b.cashNzd - a.cashNzd)).toBeLessThan(0.01);
  });
  it("a Stake XLSX (ASX and US tabs) reads through the workbook path", async () => {
    const buf = readFileSync("src/lib/import/fixtures/stake.xlsx");
    const csv = await workbookToCsv(new Uint8Array(buf).buffer as ArrayBuffer);
    const p = await previewImport(csv);
    expect(p.toWrite.length).toBe(2);
    expect(Math.abs(p.cashNzd - -238)).toBeLessThan(0.01);
  });
  it("unverified layouts are labelled as not verified; only Hatch, Swyftx and IBKR are named as checked", async () => {
    const p = await previewImport(fx("sharesies-no-fx.csv"));
    expect(p.label).toMatch(/layout not verified against a real export; check every row/);
    expect((await previewImport(fx("ibkr.csv"))).label).toBe("IBKR");
    const copy = readFileSync("src/app/import/import-client.tsx", "utf8") + readFileSync("src/components/import/BrokerImportPanel.tsx", "utf8");
    expect(copy).not.toMatch(/Upload a Sharesies|Stake Transaction Report/);
    expect(copy).toMatch(/Hatch, Swyftx and IBKR layouts are checked/);
  });
  it("the moved edge-case fixtures exist in the real set", () => {
    for (const f of ["malformed.txt", "readable-generic.csv", "bad-rows.csv", "sharesies-no-fx.csv", "sharesies-name.csv"]) expect(fx(f).length).toBeGreaterThan(10);
  });
});

describe("b34 M-2 (Chief ruling): saved snapshot time, labelled honestly", () => {
  it("today: 'Prices last updated h:mm am NZT'; another day adds '13 Oct'", () => {
    const at = "2026-10-12T19:32:00Z"; // 13 Oct 8:32 am NZDT
    expect(savedSnapshotLabel(at, Date.parse("2026-10-12T22:00:00Z"))).toBe("Prices last updated 8:32 am NZT");
    expect(savedSnapshotLabel(at, Date.parse("2026-10-18T20:00:00Z"))).toBe("Prices last updated 8:32 am NZT, 13 Oct");
  });
  it("the equity row never says 'unavailable' while a saved time exists", () => {
    const s = readFileSync("src/lib/status-feeds.server.ts", "utf8");
    expect(s).toMatch(/latestSavedEquityAt\(\)/);
    expect(s).toMatch(/statusSavedLabel\(at, now\)/); // M-2: same NZDT format as the other rows
  });
});

describe("b34 BS-01 test hooks", () => {
  it("fixture sync and token-ciphertext hooks are allow-listed and never return the token", () => {
    const a = readFileSync("src/app/api/test-hooks/ibkr-fixture-sync/route.ts", "utf8");
    const b = readFileSync("src/app/api/test-hooks/ibkr-token/route.ts", "utf8");
    for (const s of [a, b]) expect(s).toMatch(/testHooksAllowedFor\(/);
    expect(a).toMatch(/applyFlexStatement\(user as never, IBKR_FLEX_FIXTURE\)/);
    expect(b).not.toMatch(/enc_token[,}]/);
    expect(b).toMatch(/storedLength/);
  });
  it("a 403 from IBKR tells the member to check token and Query ID", () => {
    expect(readFileSync("src/lib/broker-sync/ibkr-sync.server.ts", "utf8")).toMatch(/Check your Flex token and Query ID in Client Portal → Flex Web Service/);
  });
});
