/**
 * b88 MN-DEX-1 (Lukas, 28 Oct 2026): DEX tokens on /market-news at phone, tablet and laptop widths.
 * Pure: picks real rows from the saved DEX snapshot. No snapshot or a stale one shows no prices.
 */
import type { DexTokenRow } from "@/lib/crypto-dex";
import { pricesAsAtLabel, pricesPausedSince, snapshotIsStale } from "@/lib/crypto-board";

export const DEX_PANEL_LIMIT = 10;

export interface DexPanelRow {
  id: string;
  symbol: string;
  name: string;
  price: string;
  volume: string;
  network: string;
  dex: string;
}
export interface DexPanel {
  rows: DexPanelRow[];
  /** As-at line, or the paused line when stale, or a no-snapshot line. */
  line: string;
}

export function formatUsdToken(v: number): string {
  if (v >= 1) return `US$${v.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `US$${Number(v.toPrecision(4)).toString()}`;
}
function formatVolume(v: number): string {
  if (v >= 1e9) return `US$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `US$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `US$${(v / 1e3).toFixed(2)}K`;
  return `US$${v.toFixed(2)}`;
}

export function buildDexPanel(snap: { at: string | null; rows: DexTokenRow[] } | null, now = Date.now()): DexPanel {
  if (!snap || !Array.isArray(snap.rows) || !snap.rows.length) return { rows: [], line: "The DEX list is not available right now." };
  if (snap.at && snapshotIsStale(snap.at, now)) return { rows: [], line: pricesPausedSince(snap.at) };
  const rows = snap.rows
    .filter((r) => !r.priceUnavailable && typeof r.price === "number" && r.price > 0 && Number.isFinite(r.price))
    .sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0))
    .slice(0, DEX_PANEL_LIMIT)
    .map((r) => ({
      id: r.id,
      symbol: r.symbol,
      name: r.name,
      price: formatUsdToken(r.price as number),
      volume: typeof r.volume24h === "number" && r.volume24h >= 0 ? formatVolume(r.volume24h) : "—",
      network: r.network,
      dex: r.dex,
    }));
  return { rows, line: (snap.at && pricesAsAtLabel(snap.at, now)) || "Saved time not stored." };
}
