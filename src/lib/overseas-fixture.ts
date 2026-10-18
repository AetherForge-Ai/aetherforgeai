/**
 * b30 H-9: overseas fixture for the FIF working paper (income year 1 Apr 2026 – 31 Mar 2027).
 * Two US shares whose cost alone passes NZ$50,000, one exempt ASX share (excluded, dividends
 * as overseas income), one DRP and one 2:1 split. Rates are fixture values with a named
 * source and date so FDR/CV and FX lines can be checked; they are not market data.
 */
export const OVERSEAS_FIXTURE_TAG = "[FIXTURE:H9-OVERSEAS]";
export const OVERSEAS_FIXTURE_FX_SOURCE = "Fixture rate (Frankfurter-style daily close)";

export type FixtureRow = {
  type: "deposit" | "buy" | "dividend";
  ticker?: string;
  asset_type?: "stock";
  quantity?: number;
  price?: number;
  amount?: number;
  fees?: number;
  fx_rate?: number;
  fx_source?: string;
  trade_date: string;
  dividend_gross?: number;
  dividend_drp?: number;
  dividend_drp_shares?: number;
};

export type FixtureSplit = { ticker: string; ratio: number; date: string };

export function overseasFixtureRows(): { rows: FixtureRow[]; split: FixtureSplit } {
  const fx = (rate: number, date: string) => ({ fx_rate: rate, fx_source: `${OVERSEAS_FIXTURE_FX_SOURCE}, ${date}` });
  const rows: FixtureRow[] = [
    { type: "deposit", amount: 120_000, trade_date: "2026-04-02" },
    // fx_rate is NZ$ per unit (as the ledger stores it). US: 150 × US$190 × 1.70 = NZ$48,450;
    // 40 × US$410 × 1.70 = NZ$27,880 → NZ$76,330 US cost on its own.
    { type: "buy", ticker: "AAPL", asset_type: "stock", quantity: 150, price: 190, fees: 0, trade_date: "2026-05-04", ...fx(1.7, "2026-05-04") },
    { type: "buy", ticker: "MSFT", asset_type: "stock", quantity: 40, price: 410, fees: 0, trade_date: "2026-06-01", ...fx(1.7, "2026-06-01") },
    // Exempt ASX share: 300 × A$45 × 1.10 = NZ$14,850 (excluded from the FIF cost).
    { type: "buy", ticker: "BHP.AX", asset_type: "stock", quantity: 300, price: 45, fees: 0, trade_date: "2026-07-01", ...fx(1.1, "2026-07-01") },
    // DRP on the ASX share: A$0.80 × 300 = A$240 reinvested as 5 shares.
    { type: "dividend", ticker: "BHP.AX", asset_type: "stock", trade_date: "2026-09-25", dividend_gross: 240, dividend_drp: 240, dividend_drp_shares: 5, ...fx(1.1, "2026-09-25") },
  ];
  return { rows, split: { ticker: "AAPL", ratio: 2, date: "2026-08-31" } };
}

/** US cost in NZ$ (the peak FIF cost the fixture must exceed NZ$50,000 with). */
export function overseasFixtureUsCostNzd(): number {
  return overseasFixtureRows()
    .rows.filter((r) => r.type === "buy" && r.ticker && !r.ticker.includes("."))
    .reduce((sum, r) => sum + (r.quantity ?? 0) * (r.price ?? 0) * (r.fx_rate ?? 1), 0);
}
