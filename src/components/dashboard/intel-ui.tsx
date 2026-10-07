import { EXCHANGE_META, resolveExchange, type SecurityIntel } from "@/lib/market-intel";

/** Colour class for a signed percentage. */
export function pctClass(v: number): string {
  return v > 0 ? "text-emerald-600" : v < 0 ? "text-rose-600" : "text-muted-foreground";
}

export function fmtPct(v: number): string {
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

/**
 * Drop recommendation words from copy shown on public markets and projections.
 * Does not invent a replacement rating.
 */
export function publicMarketNote(text: string): string {
  const rating =
    /^(?:strong buy|buy|sell|reduce|hold|accumulate|watch|add)\b(?:\s*[·:.\-–—]\s*|\s+)?/i;
  let next = (text || "").trim();
  let prev = "";
  while (next && next !== prev) {
    prev = next;
    next = next.replace(rating, "").trim();
  }
  return next;
}

/** Market chip (NZX / ASX / US). */
export function MarketChip({ market }: { market: SecurityIntel["market"] }) {
  return (
    <span className="rounded bg-primary/12 px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-primary">
      {market}
    </span>
  );
}

/**
 * Exchange chip that resolves the US market code into the two headline indices
 * (Dow Jones / NASDAQ) so a security shows its real exchange: NZX · ASX · DOW · NASDAQ.
 */
export function ExchangeChip({ ticker, market }: { ticker: string; market: SecurityIntel["market"] }) {
  if (market === "CRYPTO") return <MarketChip market={market} />;
  const ex = resolveExchange(ticker, market);
  return (
    <span className="rounded bg-primary/12 px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-primary">
      {EXCHANGE_META[ex].label}
    </span>
  );
}
