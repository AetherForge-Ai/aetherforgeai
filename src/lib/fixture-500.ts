import { buildPortfolioSnapshot, type PortfolioSnapshot, type SnapshotLedgerRow } from "@/lib/portfolio-snapshot";

/** Goal b18 H-4: synthetic example book for the 500-row render check. Never saved. */
export const FIXTURE_500_LABEL = "Example data · 500 synthetic rows · nothing is saved";
export const FIXTURE_TICKERS = Array.from({ length: 20 }, (_, i) => `EXAMPLE${i + 1}`);

export function fixture500Rows(count = 500): SnapshotLedgerRow[] {
  const rows: SnapshotLedgerRow[] = [
    { _id: "fx-0", type: "deposit", total: 1_000_000, cash_nzd: 1_000_000, currency: "NZD", executed_at: "2025-04-01T00:00:00.000Z" },
  ];
  const start = Date.UTC(2025, 3, 2);
  for (let i = 1; i < count; i++) {
    const ticker = FIXTURE_TICKERS[i % FIXTURE_TICKERS.length];
    const day = new Date(start + i * 12 * 3600_000).toISOString();
    const price = 1 + (i % 17) * 0.5;
    if (i % 5 === 0) {
      rows.push({ _id: `fx-${i}`, type: "dividend", ticker, total: 10 + (i % 7), cash_nzd: 10 + (i % 7), currency: "NZD", executed_at: day });
    } else {
      const qty = 10 + (i % 9);
      rows.push({ _id: `fx-${i}`, type: "buy", ticker, asset_type: "stock", quantity: qty, price, fees: 0, total: qty * price, cash_nzd: -(qty * price), currency: "NZD", executed_at: day });
    }
  }
  return rows;
}

export function fixture500Snapshot(): PortfolioSnapshot {
  const rows = fixture500Rows();
  return buildPortfolioSnapshot({
    rows,
    marks: FIXTURE_TICKERS.map((ticker, i) => ({ ticker, price: 2 + i * 0.25, currency: "NZD", assetType: "stock", source: "Example data" })),
    asOf: "2026-10-16T05:00:00.000Z",
    priceSource: "Example data",
    fxSourced: true,
    fxNow: { NZD: 1 },
  });
}
