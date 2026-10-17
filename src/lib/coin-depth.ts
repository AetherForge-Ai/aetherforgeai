/**
 * Goal b11 G-17: crypto depth (market cap, volume, supply, 1H/30D change).
 * Every figure shows its source and time. A missing figure shows "—" with the
 * reason, never an estimate.
 */
import { formatDisplayDateTime } from "@/lib/currency";

export function coinSourceName(source: string | null | undefined): string {
  const s = String(source || "").toLowerCase();
  if (s.includes("gecko")) return "CoinGecko";
  if (s.includes("paprika")) return "CoinPaprika";
  if (s.includes("binance")) return "Binance";
  if (s.includes("coinbase")) return "Coinbase";
  if (s.includes("kraken")) return "Kraken";
  if (s.includes("dex")) return "DEX Screener";
  return source ? String(source) : "the price source";
}

export function coinMetricsSourceLine(source: string | null | undefined, quotedAt: string | null | undefined): string {
  const when = quotedAt ? formatDisplayDateTime(quotedAt) : "—";
  return `Source: ${coinSourceName(source)} · as of ${when === "—" ? "time not supplied" : when}`;
}

export function depthMissingReason(source: string | null | undefined): string {
  return `Not supplied by ${coinSourceName(source)}`;
}
