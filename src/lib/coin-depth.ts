/**
 * Goal b11 G-17: crypto depth (market cap, volume, supply, 1H/30D change).
 * Every figure shows its source and time. A missing figure shows "—" with the
 * reason, never an estimate.
 */
import { formatDisplayDateTime } from "@/lib/currency";

export function coinSourceName(source: string | null | undefined): string {
  const s = String(source || "").toLowerCase();
  if (s.includes("dexpaprika")) return "DexPaprika";
  if (s.includes("gecko")) return "CoinGecko";
  if (s.includes("paprika")) return "CoinPaprika";
  if (s.includes("binance")) return "Binance";
  if (s.includes("coinbase")) return "Coinbase";
  if (s.includes("kraken")) return "Kraken";
  if (s.includes("yahoo")) return "Yahoo Finance";
  if (s.includes("dex")) return "DEX Screener";
  return source ? String(source) : "the price source";
}

export function coinMetricsSourceLine(source: string | null | undefined, quotedAt: string | null | undefined): string {
  const when = quotedAt ? formatDisplayDateTime(quotedAt) : "—";
  return `Source: ${coinSourceName(source)} · as of ${when === "—" ? "time not supplied" : when}`;
}

/**
 * A figure the feeds did not send. The time is when we checked, not a made-up quote.
 * G-17: never a blank cell.
 */
export function depthMissingReason(_source?: string | null, checkedAt?: string | null): string {
  const when = checkedAt ? formatDisplayDateTime(checkedAt) : "";
  const time = when && when !== "—" ? when : "time not supplied";
  return `not available from source · checked ${time}`;
}
