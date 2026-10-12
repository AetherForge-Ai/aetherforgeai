/**
 * Koins sweep gate. Rank only from the shared snapshot.
 * A failed gate keeps the section and does not invent a ranking.
 *
 * pull-check:v3-tier1a-2026-10-12
 */

import type { ApexReport, MoverRow, ProjectionRow } from "@/lib/apex";
import {
  KOINS_SNAPSHOT_FRESH_MS,
  koinsUnavailableLine,
  snapshotIsStale,
  type WindowMoves,
} from "@/lib/crypto-board";
import type { CurrencyCode } from "@/lib/currency";

const STABLE = new Set([
  "USDT",
  "USDC",
  "DAI",
  "FDUSD",
  "TUSD",
  "USDE",
  "PYUSD",
  "USD0",
  "USX",
  "BUSD",
  "USDD",
  "FRAX",
  "LUSD",
  "GUSD",
  "USDP",
  "EURC",
  "USDS",
  "USD1",
  "USDY",
  "USDG",
  "CRVUSD",
]);

const WRAPPED = new Set([
  "WETH",
  "WBTC",
  "WEETH",
  "WSTETH",
  "STETH",
  "CBBTC",
  "CBETH",
  "BTC.B",
  "EZETH",
  "RETH",
  "WBETH",
  "METH",
  "WBNB",
  "WSOL",
  "BTCB",
]);

const LOOKALIKE: Record<string, string> = {
  "Α": "A",
  "В": "B",
  "Е": "E",
  "К": "K",
  "М": "M",
  "Н": "H",
  "О": "O",
  "Р": "P",
  "С": "C",
  "Т": "T",
  "Х": "X",
  "Ѕ": "S",
  "І": "I",
  "Ј": "J",
  "Υ": "Y",
  "Ζ": "Z",
};

export interface KoinsCandidate {
  symbol: string;
  name: string;
  price: number;
  moves: WindowMoves;
  /** Second source. An extreme or a duplicated percent stays only when this agrees. */
  agree?: WindowMoves | null;
  projected7dPct?: number | null;
  confidence?: number | null;
}

const OUTLIER_CAP: Record<"24h" | "7d" | "30d", number> = { "24h": 40, "7d": 50, "30d": 60 };

function sourcesAgree(row: KoinsCandidate, window: "24h" | "7d" | "30d", move: number): boolean {
  if (!row.agree) return false;
  const other = window === "24h" ? row.agree.h24 : window === "7d" ? row.agree.d7 : row.agree.d30;
  return typeof other === "number" && Number.isFinite(other) && Math.abs(other - move) <= 3;
}

export function canonicalSweepSymbol(symbol: string): string {
  let out = "";
  for (const ch of (symbol || "").normalize("NFKC").toUpperCase()) {
    out += LOOKALIKE[ch] || ch;
  }
  return out.replace(/[^A-Z0-9.]/g, "");
}

export function excludedFromKoinsSweep(symbol: string): boolean {
  const key = canonicalSweepSymbol(symbol);
  if (!key) return true;
  if (STABLE.has(key) || WRAPPED.has(key)) return true;
  if (key === "USDT" || key.startsWith("USD") && key.length <= 6) return true;
  return false;
}

export function printsUnderReviewAlways(count: number): string {
  const n = Math.max(0, Math.trunc(Number(count) || 0));
  return n === 1 ? "1 print under review" : `${n} prints under review`;
}

export function onlyGainedLine(count: number, window: "24h" | "7d" | "30d"): string {
  const n = Math.max(0, Math.trunc(count));
  if (window === "7d") return `Only ${n} coins gained over 7 days.`;
  if (window === "24h") return `Only ${n} coins gained over 24 hours.`;
  return `Only ${n} coins gained over the month.`;
}

function moveFor(row: KoinsCandidate, window: "24h" | "7d" | "30d"): number | null {
  if (window === "24h") return row.moves.h24;
  if (window === "7d") return row.moves.d7;
  return row.moves.d30;
}

export function windowGatePasses(rows: KoinsCandidate[], window: "24h" | "7d" | "30d"): boolean {
  const candidates = rows.filter((row) => !excludedFromKoinsSweep(row.symbol) && row.price > 0);
  if (candidates.length < 10) return false;
  const known = candidates.filter((row) => moveFor(row, window) != null).length;
  return known / candidates.length >= 0.8;
}

export function rankGainers(
  rows: KoinsCandidate[],
  window: "24h" | "7d" | "30d",
  limit = 10
): { movers: MoverRow[]; withheld: number; gained: number } {
  const candidates = rows.filter((row) => !excludedFromKoinsSweep(row.symbol) && row.price > 0);
  let withheld = 0;
  const positive: KoinsCandidate[] = [];
  for (const row of candidates) {
    const move = moveFor(row, window);
    if (move == null) {
      withheld += 1;
      continue;
    }
    if (move > 0) positive.push(row);
  }
  const dupes = new Map<string, number>();
  for (const row of positive) {
    const key = (moveFor(row, window) as number).toFixed(2);
    dupes.set(key, (dupes.get(key) || 0) + 1);
  }
  const kept: KoinsCandidate[] = [];
  for (const row of positive) {
    const move = moveFor(row, window) as number;
    const extreme = Math.abs(move) > OUTLIER_CAP[window];
    const cloned = (dupes.get(move.toFixed(2)) || 0) >= 2 && Math.abs(move) >= 20;
    if ((extreme || cloned) && !sourcesAgree(row, window, move)) {
      withheld += 1;
      continue;
    }
    kept.push(row);
  }
  kept.sort((a, b) => (moveFor(b, window) as number) - (moveFor(a, window) as number) || a.symbol.localeCompare(b.symbol));
  const movers: MoverRow[] = kept.slice(0, limit).map((row) => ({
    ticker: row.symbol.toUpperCase(),
    name: row.name,
    market: "CRYPTO",
    currency: "USD" as CurrencyCode,
    price: row.price,
    changePct: moveFor(row, window) as number,
    withheld: false,
  }));
  return { movers, withheld, gained: kept.length };
}

export function projectionsAreUniform(rows: Array<{ projected7dPct: number; confidence: number }>): boolean {
  if (rows.length < 2) return false;
  const buckets = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.projected7dPct.toFixed(2)}|${Math.round(row.confidence)}`;
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  let largest = 0;
  for (const count of buckets.values()) largest = Math.max(largest, count);
  return largest / rows.length >= 0.5;
}

export interface KoinsBoardState {
  at: string | null;
  /** Staging switch. KOINS_FEED_FAILURE=on forces every list into the unavailable sentence. */
  forceFailure?: boolean;
  candidates: KoinsCandidate[];
  projections: ProjectionRow[];
}

const WINDOWS: { window: string; key: "24h" | "7d" | "30d" }[] = [
  { window: "Last 24 hours", key: "24h" },
  { window: "Last 7 days", key: "7d" },
  { window: "Last month", key: "30d" },
];

/**
 * Rewrites Koins mover windows and projected movers.
 * Sections stay on the report. A failed gate shows the unavailable sentence and no ranked rows.
 */
export function applyKoinsSweeps(report: ApexReport, board: KoinsBoardState, now = Date.now()): ApexReport {
  if (report.bot !== "crypto") return report;
  const stale = snapshotIsStale(board.at, now, KOINS_SNAPSHOT_FRESH_MS);
  const forced = !!board.forceFailure;
  const unavailable = koinsUnavailableLine(board.at);
  const group = report.marketMovers.find((row) => row.market === "CRYPTO") || report.marketMovers[0];
  if (group) {
    group.windows = WINDOWS.map((slot) => {
      const open = !forced && !stale && windowGatePasses(board.candidates, slot.key);
      if (!open) {
        return { window: slot.window, movers: [], underReview: [], withheldCount: 0, reviewNote: unavailable };
      }
      const ranked = rankGainers(board.candidates, slot.key);
      if (ranked.gained === 0) {
        return { window: slot.window, movers: [], underReview: [], withheldCount: ranked.withheld, reviewNote: unavailable };
      }
      const notes = [printsUnderReviewAlways(ranked.withheld)];
      if (ranked.gained < 10) notes.push(onlyGainedLine(ranked.gained, slot.key));
      return {
        window: slot.window,
        movers: ranked.movers,
        underReview: [],
        withheldCount: ranked.withheld,
        reviewNote: notes.join(" "),
      };
    });
  }
  const leaders = board.projections.filter((row) => !excludedFromKoinsSweep(row.ticker));
  const projectionBlocked = forced || stale || !leaders.length || projectionsAreUniform(leaders);
  report.projectionLeaders = projectionBlocked ? [] : leaders;
  report.koinsUnavailableNote = projectionBlocked ? unavailable : null;
  return report;
}
