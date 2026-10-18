/**
 * G-20: pack and check a stored scorecard.
 * The stored body includes each call so the hash can be recomputed.
 * The view returned to a page has totals only: no ticker, signal or report id.
 */
import { gzipSync, gunzipSync } from "node:zlib";
import { verifyScorecard, type CallResult, type ScorecardBody, type ScorecardCall } from "@/lib/track-record";

/** Hidden watchlist ticker. Not a holding. GET hides it and POST rejects it. */
export const TRACK_SCORECARD_TICKER = "AF-TRS";

/** Watchlist `name` holds at most this many characters (same slot as the crypto snapshot). */
export const SCORECARD_NAME_MAX = 24_000;
export const SCORECARD_CHUNK = 20_000;
export const SCORECARD_MAX_CHUNKS = 40;

const RESULTS = new Set<CallResult>(["hit", "miss", "pending", "unscored"]);

export function isTrackScorecardTicker(ticker: string | null | undefined): boolean {
  const key = (ticker || "").trim().toUpperCase();
  return key === TRACK_SCORECARD_TICKER || /^AF-TRS-\d+$/.test(key);
}

export function trackScorecardChunkTicker(index: number): string {
  return `${TRACK_SCORECARD_TICKER}-${index}`;
}

export interface TrackRunSnapshot {
  reportsRead: number;
  laterPrices: { fetched: number; reused: number };
  verified: readonly { ok: boolean }[];
  card: ScorecardBody & { scorecardHash: string; published: false };
}

export interface StoredTrackRun {
  v: 1;
  storedAt: string;
  reportsRead: number;
  laterFetched: number;
  laterReused: number;
  verifiedOk: number;
  verifiedTotal: number;
  card: ScorecardBody & { scorecardHash: string; published: false };
}

/** Totals a page may render. Per-call rows stay in the store. */
export interface TrackRecordView {
  storedAt: string;
  reportsRead: number;
  laterFetched: number;
  laterReused: number;
  week: string;
  calls: number;
  hits: number;
  misses: number;
  pending: number;
  unscored: number;
  scorecardHash: string;
  verifiedOk: number;
  verifiedTotal: number;
  hashMatches: boolean;
  totalsAddUp: boolean;
}

export function snapshotFromRun(run: TrackRunSnapshot, storedAt: string): StoredTrackRun {
  const calls: ScorecardCall[] = run.card.calls.map((c) => ({ hash: c.hash, ticker: c.ticker, signal: c.signal, result: c.result }));
  return {
    v: 1,
    storedAt,
    reportsRead: run.reportsRead,
    laterFetched: run.laterPrices.fetched,
    laterReused: run.laterPrices.reused,
    verifiedOk: run.verified.filter((v) => v.ok).length,
    verifiedTotal: run.verified.length,
    card: {
      week: run.card.week,
      calls,
      hits: run.card.hits,
      misses: run.card.misses,
      pending: run.card.pending,
      unscored: run.card.unscored,
      scorecardHash: run.card.scorecardHash,
      published: false,
    },
  };
}

export interface PackedScorecard {
  header: string;
  chunks: string[];
}

/** Gzip, then one name field, or a header plus AF-TRS-1..N slices. Null when it cannot fit. */
export function packScorecard(json: string, max = SCORECARD_NAME_MAX, chunk = SCORECARD_CHUNK): PackedScorecard | null {
  const gz = `z1:${gzipSync(Buffer.from(json, "utf8")).toString("base64")}`;
  if (gz.length <= max) return { header: gz, chunks: [] };
  const chunks: string[] = [];
  for (let i = 0; i < gz.length; i += chunk) chunks.push(gz.slice(i, i + chunk));
  if (chunks.length > SCORECARD_MAX_CHUNKS || chunks.some((part) => part.length > max)) return null;
  const header = JSON.stringify({ v: 1, parts: chunks.length });
  if (header.length > max) return null;
  return { header, chunks };
}

export function unpackScorecard(header: string, chunks: readonly string[]): string | null {
  let packed = header;
  if (!header.startsWith("z1:")) {
    let parts = 0;
    try {
      const manifest = JSON.parse(header) as { parts?: unknown };
      parts = typeof manifest.parts === "number" ? manifest.parts : 0;
    } catch {
      return null;
    }
    if (parts < 1 || chunks.length < parts) return null;
    packed = chunks.slice(0, parts).join("");
    if (!packed.startsWith("z1:")) return null;
  }
  try {
    return gunzipSync(Buffer.from(packed.slice(3), "base64")).toString("utf8");
  } catch {
    return null;
  }
}

function whole(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0;
}

/** Parse a stored card into totals. Returns null when the row is not a scorecard. */
export async function viewFromStoredJson(raw: string): Promise<TrackRecordView | null> {
  let parsed: StoredTrackRun;
  try {
    parsed = JSON.parse(raw) as StoredTrackRun;
  } catch {
    return null;
  }
  if (parsed?.v !== 1 || !parsed.card || !Array.isArray(parsed.card.calls)) return null;
  const card = parsed.card;
  if (typeof card.scorecardHash !== "string" || !/^[0-9a-f]{64}$/.test(card.scorecardHash)) return null;
  if (typeof card.week !== "string" || !card.week) return null;
  if (typeof parsed.storedAt !== "string" || !parsed.storedAt) return null;
  if (![card.hits, card.misses, card.pending, card.unscored, parsed.reportsRead, parsed.laterFetched, parsed.laterReused, parsed.verifiedOk, parsed.verifiedTotal].every(whole)) return null;
  for (const c of card.calls) {
    if (!c || typeof c.hash !== "string" || typeof c.ticker !== "string" || typeof c.signal !== "string" || !RESULTS.has(c.result)) return null;
  }
  const hashMatches = await verifyScorecard(card);
  const calls = card.calls.length;
  return {
    storedAt: parsed.storedAt,
    reportsRead: parsed.reportsRead,
    laterFetched: parsed.laterFetched,
    laterReused: parsed.laterReused,
    week: card.week,
    calls,
    hits: card.hits,
    misses: card.misses,
    pending: card.pending,
    unscored: card.unscored,
    scorecardHash: card.scorecardHash,
    verifiedOk: parsed.verifiedOk,
    verifiedTotal: parsed.verifiedTotal,
    hashMatches,
    totalsAddUp: card.hits + card.misses + card.pending + card.unscored === calls,
  };
}
