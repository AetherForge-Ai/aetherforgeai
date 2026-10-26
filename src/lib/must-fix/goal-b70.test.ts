// pull-check:v3-fix-b76-2026-10-27
/** b70 (Chief, 27 Oct 2026): TT b69 grade — G-10 holding row within 1 s on confirm and delete; P3 TON/GRAM. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildPortfolioSnapshot, paintConfirmedSnapshot, unpaintDeletedTrade, withLedgerLine } from "@/lib/portfolio-snapshot";
import type { PortfolioSnapshot } from "@/lib/portfolio-snapshot";
import { buildHoldingsTable, DEFAULT_HOLDINGS_QUERY } from "@/lib/holdings-table";
import { bumpHoldingsGeneration, holdingsGeneration, holdingsResponseIsStale } from "@/lib/holdings-generation";
import { CRYPTO_SEARCH_ALIASES, normalizeCryptoTicker, vendorFor } from "@/lib/crypto-vendors";
import { searchAssets } from "@/lib/asset-search";

const read = (p: string) => readFileSync(p, "utf8");

function base(rows: Record<string, unknown>[] = []): PortfolioSnapshot {
  return buildPortfolioSnapshot({
    rows: [
      { _id: "dep", type: "deposit", trade_date: "2026-10-20", ticker: "", asset_type: "stock", currency: "NZD", fx_rate: 1, fees: 0, amount: 100, total: 100, cash_nzd: 100 },
      ...rows,
    ] as never,
    marks: [],
    fxNow: { NZD: 1 },
    fxSourced: true,
    fxSource: "test",
    fxAsOf: "2026-10-27",
    asOf: "2026-10-27T00:00:00.000Z",
    priceSource: "test",
  } as never);
}

const rowsFor = (snap: PortfolioSnapshot, ticker: string) =>
  buildHoldingsTable(snap, DEFAULT_HOLDINGS_QUERY, [] as never)
    .groups.flatMap((g) => g.rows)
    .filter((r) => (r as { ticker?: string }).ticker === ticker);

const buy = { _id: "optimistic-1", type: "buy", ticker: "AIR.NZ", asset_type: "stock", quantity: 1, price: 0.38, fx_rate: 1, fees: 0 };

describe("b70 G-10 holdings row on confirm", () => {
  it("the optimistic paint adds exactly one AIR.NZ row", () => {
    const painted = withLedgerLine(paintConfirmedSnapshot(base(), buy as never, 99.62), buy as never, -0.38);
    expect(rowsFor(painted, "AIR.NZ")).toHaveLength(1);
  });

  it("painting the saved row after the optimistic one (rebuilt from the base) does not duplicate", () => {
    const start = base();
    const saved = { ...buy, _id: "srv-1" };
    const repainted = paintConfirmedSnapshot(start, saved as never, 99.62);
    expect(rowsFor(repainted, "AIR.NZ")).toHaveLength(1);
    const pos = repainted.groups.flatMap((g) => g.positions).find((p) => p.ticker === "AIR.NZ");
    expect(pos?.quantity).toBe(1);
  });

  it("a snapshot read started before the optimistic paint is stale once the paint bumps the generation", () => {
    const captured = holdingsGeneration();
    bumpHoldingsGeneration();
    expect(holdingsResponseIsStale(captured)).toBe(true);
  });

  it("PortfolioDashboard bumps the generation on the optimistic paint and on delete", () => {
    const src = read("src/components/dashboard/PortfolioDashboard.tsx");
    const optimistic = src.slice(src.indexOf("if (updated?.optimistic) {"), src.indexOf("if (updated?.optimisticRollback)"));
    expect(optimistic).toMatch(/bumpHoldingsGeneration\(\)/);
    expect(optimistic).toMatch(/lastMutationAtRef\.current = Date\.now\(\)/);
    const del = src.slice(src.indexOf("async function handleDeleteDividend"), src.indexOf("async function handleEditTrade"));
    expect(del).toMatch(/bumpHoldingsGeneration\(\)/);
    expect(del).toMatch(/unpaintDeletedTrade\(/);
  });
});

describe("b70 G-10 holdings row on delete", () => {
  const booked = { _id: "b1", type: "buy", trade_date: "2026-10-21", ticker: "AIR.NZ", asset_type: "stock", currency: "NZD", fx_rate: 1, fees: 0, quantity: 1, price: 0.38, total: 0.38, cash_nzd: -0.38 };

  it("deleting the only buy removes the holding row; other rows stay", () => {
    const other = { ...booked, _id: "b2", ticker: "FPH.NZ", quantity: 2, price: 30, total: 60, cash_nzd: -60 };
    const snap = base([booked, other]);
    expect(rowsFor(snap, "AIR.NZ")).toHaveLength(1);
    const line = snap.ledger.find((l) => l.id === "b1")!;
    const after = unpaintDeletedTrade({ ...snap, ledger: snap.ledger.filter((l) => l.id !== "b1") }, line);
    expect(rowsFor(after, "AIR.NZ")).toHaveLength(0);
    expect(rowsFor(after, "FPH.NZ")).toHaveLength(1);
    expect(after.kpis.cash.value).toBe(snap.kpis.cash.value);
  });

  it("deleting one of two buys keeps one row with the remaining quantity", () => {
    const second = { ...booked, _id: "b3", trade_date: "2026-10-22", quantity: 2 };
    const snap = base([booked, second]);
    const line = snap.ledger.find((l) => l.id === "b3")!;
    const after = unpaintDeletedTrade({ ...snap, ledger: snap.ledger.filter((l) => l.id !== "b3") }, line);
    expect(rowsFor(after, "AIR.NZ")).toHaveLength(1);
    expect(after.groups.flatMap((g) => g.positions).find((p) => p.ticker === "AIR.NZ")?.quantity).toBe(1);
  });

  it("a non-trade line (deposit) leaves the holdings untouched", () => {
    const snap = base([booked]);
    const dep = snap.ledger.find((l) => l.id === "dep")!;
    expect(unpaintDeletedTrade(snap, dep)).toBe(snap);
  });
});

describe("b70 P3 TON/GRAM", () => {
  it("the-open-network is GRAM, as /api/crypto shows it; TON is an alias", () => {
    expect(vendorFor("GRAM")?.coingecko).toBe("the-open-network");
    expect(vendorFor("TON")?.coingecko).toBe("the-open-network");
    expect(normalizeCryptoTicker("TON")).toBe("GRAM");
    expect(CRYPTO_SEARCH_ALIASES.ton).toBe("GRAM");
    expect(CRYPTO_SEARCH_ALIASES.gram).toBe("GRAM");
  });

  it("searching 'ton' or 'gram' finds the coin", () => {
    const coins = [{ symbol: "GRAM", name: "Gram (prev. Toncoin)", assetType: "crypto", price: 1.5, id: "the-open-network" }] as never;
    for (const q of ["ton", "gram", "TON", "toncoin"]) {
      expect(searchAssets(q, { coins }).some((h) => h.symbol === "GRAM")).toBe(true);
    }
  });
});

describe("b70 build", () => {
  it("pins the build and the pull-check", () => {
    expect(read("public/build-version.txt").trim()).toMatch(/^v3-(g10|del404|fix|m7|h1)-b7\d-2026-10-2[78]$/);
    expect(read("qa/PULL-CHECK-2026-10-12.md")).toMatch(/Goal b70[^\n]*pull-check:v3-fix-b76-2026-10-27/);
  });
});
