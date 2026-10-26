// pull-check:v3-g10-b73-2026-10-28
/** b73 (Chief, 27 Oct 2026): G-10 — priced cells on the optimistic and confirmed paint (trace bc-47cf729a). */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildPortfolioSnapshot, inferTradeCurrency, paintConfirmedSnapshot, withLedgerLine } from "@/lib/portfolio-snapshot";
import type { PortfolioSnapshot } from "@/lib/portfolio-snapshot";
import { buildHoldingsTable, DEFAULT_HOLDINGS_QUERY } from "@/lib/holdings-table";

const read = (p: string) => readFileSync(p, "utf8");
function base(rows: Record<string, unknown>[] = [], marks: unknown[] = []): PortfolioSnapshot {
  return buildPortfolioSnapshot({
    rows: [{ _id: "dep", type: "deposit", trade_date: "2026-10-20", ticker: "", asset_type: "stock", currency: "NZD", fx_rate: 1, fees: 0, amount: 1, total: 1, cash_nzd: 1 }, ...rows] as never,
    marks: marks as never, fxNow: { NZD: 1 }, fxSourced: true, fxSource: "t", fxAsOf: "2026-10-27", asOf: "2026-10-27T00:00:00.000Z", priceSource: "t",
  } as never);
}
const pos = (s: PortfolioSnapshot, t: string) => s.groups.flatMap((g) => g.positions).filter((p) => p.ticker === t);
const tableRows = (s: PortfolioSnapshot, t: string) =>
  buildHoldingsTable(s, DEFAULT_HOLDINGS_QUERY, [] as never).groups.flatMap((g) => g.rows).filter((r) => (r as { ticker?: string }).ticker === t);

// Exactly what RecordTransactionPanel sends as the optimistic row: no currency.
const optimistic = { _id: "optimistic-1", _optimistic: true, type: "buy", ticker: "AIR.NZ", asset_type: "stock", quantity: 1, price: 0.38, fx_rate: 1, fees: 0 };

describe("b73 G-10 priced cells on paint", () => {
  it("optimistic paint (no currency): quantity, price and market value are filled, not '1 × —'", () => {
    const p = withLedgerLine(paintConfirmedSnapshot(base(), optimistic as never, 0.62), optimistic as never, -0.38);
    const [h] = pos(p, "AIR.NZ");
    expect(h.quantity).toBe(1);
    expect(h.marketPriceLocal).toBe(0.38);
    expect(h.currency).toBe("NZD");
    expect(h.marketValue.value).toBeCloseTo(0.38, 2);
    expect(h.marketValue.display).toMatch(/0\.38/);
    expect(p.kpis.cash.value).toBeCloseTo(0.62, 2);
    expect(p.kpis.netWorth.value).toBeCloseTo(1, 2);
  });

  it("confirmed paint (server row with currency) also seeds the price", () => {
    const saved = { ...optimistic, _id: "srv1", _optimistic: undefined, currency: "NZD" };
    const [h] = pos(paintConfirmedSnapshot(base(), saved as never, 0.62), "AIR.NZ");
    expect(h.marketPriceLocal).toBe(0.38);
    expect(h.marketValue.value).toBeCloseTo(0.38, 2);
  });

  it("the real snapshot replaces the seeded values with one row, not two", () => {
    const painted = paintConfirmedSnapshot(base(), optimistic as never, 0.62);
    expect(tableRows(painted, "AIR.NZ")).toHaveLength(1);
    const real = base(
      [{ _id: "srv1", type: "buy", trade_date: "2026-10-27", ticker: "AIR.NZ", asset_type: "stock", currency: "NZD", fx_rate: 1, fees: 0, quantity: 1, price: 0.38, total: 0.38, cash_nzd: -0.38 }],
      [{ ticker: "AIR.NZ", price: 0.4, currency: "NZD", source: "quote", asOf: "2026-10-27T00:00:00.000Z" }]
    );
    // The dashboard swaps the whole book on a snapshot read (setBookSnapshot(reconciled)).
    expect(tableRows(real, "AIR.NZ")).toHaveLength(1);
    expect(pos(real, "AIR.NZ")).toHaveLength(1);
  });

  it("a second buy keeps one row and does not overwrite a live price", () => {
    const live = base(
      [{ _id: "b1", type: "buy", trade_date: "2026-10-26", ticker: "AIR.NZ", asset_type: "stock", currency: "NZD", fx_rate: 1, fees: 0, quantity: 1, price: 0.38, total: 0.38, cash_nzd: -0.38 }],
      [{ ticker: "AIR.NZ", price: 0.4, currency: "NZD", source: "quote", asOf: "2026-10-27T00:00:00.000Z" }]
    );
    const before = pos(live, "AIR.NZ")[0].marketPriceLocal;
    const p = paintConfirmedSnapshot(live, optimistic as never, 0.24);
    expect(pos(p, "AIR.NZ")).toHaveLength(1);
    expect(pos(p, "AIR.NZ")[0].quantity).toBe(2);
    expect(pos(p, "AIR.NZ")[0].marketPriceLocal).toBe(before);
  });

  it("currency is inferred only where it is certain", () => {
    expect(inferTradeCurrency("AIR.NZ")).toBe("NZD");
    expect(inferTradeCurrency("BHP.AX")).toBe("AUD");
    expect(inferTradeCurrency("AAPL", "stock", 1)).toBe("NZD");
    expect(inferTradeCurrency("AAPL", "stock", 0.59)).toBeNull();
    expect(inferTradeCurrency("AAPL")).toBeNull();
  });

  it("G-10 confirm wiring is unchanged and the build is pinned", () => {
    const d = read("src/components/dashboard/PortfolioDashboard.tsx");
    expect(d).toMatch(/paintConfirmedSnapshot\(current, guess, cashGuess\)/);
    expect(read("public/build-version.txt").trim()).toBe("v3-g10-b73-2026-10-28");
    expect(read("qa/PULL-CHECK-2026-10-12.md")).toMatch(/Goal b73[^\n]*pull-check:v3-g10-b73-2026-10-28/);
  });
});

// b73 part 2 (TT b72 grade): last-close seed, a11y fixes, delete 404 wording.
function lum(hex: string) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

describe("b73 part 2", () => {
  it("seeds the price from last_close when the fill price is missing", () => {
    const t = { ...optimistic, price: 0, fill_price: null, last_close: 0.4 };
    const [h] = pos(paintConfirmedSnapshot(base(), t as never, 0.62), "AIR.NZ");
    expect(h.marketPriceLocal).toBe(0.4);
    expect(h.priceSource).toBe("Last close");
  });
  it("fill price wins over last_close", () => {
    const [h] = pos(paintConfirmedSnapshot(base(), { ...optimistic, last_close: 0.4 } as never, 0.62), "AIR.NZ");
    expect(h.marketPriceLocal).toBe(0.38);
  });
  it("dashboard passes the held last close into the paint", () => {
    expect(read("src/components/dashboard/PortfolioDashboard.tsx")).toMatch(/last_close: Number\.isFinite\(heldClose\)/);
  });
  it("account trigger's accessible name starts with its visible text (initials)", () => {
    const s = read("src/components/TopNav.tsx");
    expect(s).toContain("aria-label={`${initials(user.name)} account menu`}");
    expect(s).not.toContain("Account menu for ${");
  });
  it("/tax/realised inline links are underlined, not colour-only", () => {
    for (const f of ["src/app/tax/income/page.tsx", "src/components/tax/TaxPageContent.tsx"]) {
      expect(read(f)).toMatch(/href="\/tax\/realised" className="text-primary underline underline-offset-4"/);
    }
  });
  it("/settings gain text uses text-gain on a plain surface at ≥ 4.5:1", () => {
    const s = read("src/components/settings/SettingsClient.tsx");
    expect(s).not.toMatch(/bg-primary\/15[^"]*text-gain/);
    expect(s).toMatch(/bg-background[^"]*text-gain/);
    const css = read("src/app/globals.css");
    expect(css).toContain("--text-green: #047857");
    expect(ratio("#047857", "#f8fafc")).toBeGreaterThanOrEqual(4.5);
    expect(ratio("#34d399", "#0f172a")).toBeGreaterThanOrEqual(4.5);
  });
  it("cross-account delete 404 no longer says 'dividend'", () => {
    const s = read("src/app/api/transactions/route.ts");
    expect(s).not.toContain("That dividend was not found.");
  });
});
