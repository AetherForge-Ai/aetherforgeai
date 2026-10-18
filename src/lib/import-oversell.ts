/**
 * Goal b20 G-24: the same oversell check as Add trade, run on the import review.
 * Rows are walked in date order on top of what the member already holds; a sell
 * of more than is held at that point gets "You hold N TICKER…".
 */
export interface OversellRow {
  line: number;
  ticker: string;
  side: string;
  quantity: number;
  date?: string | null;
  executedAt?: string | null;
}

export function importOversells(
  rows: readonly OversellRow[],
  held: Readonly<Record<string, number>>
): Record<number, string> {
  const pos: Record<string, number> = {};
  for (const [t, q] of Object.entries(held)) pos[t.toUpperCase()] = Number(q) || 0;
  const order = [...rows].sort((a, b) => {
    const da = String(a.executedAt || a.date || "");
    const db = String(b.executedAt || b.date || "");
    return da === db ? a.line - b.line : da < db ? -1 : 1;
  });
  const out: Record<number, string> = {};
  for (const r of order) {
    const t = r.ticker.toUpperCase();
    const have = pos[t] ?? 0;
    const side = r.side.toLowerCase();
    if (side === "sell") {
      if (r.quantity > have + 1e-9) {
        const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(4).replace(/0+$/, ""));
        out[r.line] = `You hold ${fmt(have)} ${t} at this point, so a sell of ${fmt(r.quantity)} is more than you hold.`;
      }
      pos[t] = have - r.quantity;
    } else if (side === "buy") {
      pos[t] = have + r.quantity;
    }
  }
  return out;
}
