import "server-only";
import { totalumSdk } from "@/lib/totalum";
import { verifyScorecard } from "@/lib/track-record";
import {
  packScorecard,
  snapshotFromRun,
  trackScorecardChunkTicker,
  TRACK_SCORECARD_TICKER,
  unpackScorecard,
  viewFromStoredJson,
  type StoredTrackRun,
  type TrackRecordView,
  type TrackRunSnapshot,
  TRACK_RUN_LOG_TICKER,
  appendRunLog,
  parseRunLog,
  type TrackRunLogEntry,
} from "@/lib/track-record-store";

/**
 * G-20: the cron writes one scorecard. The test page reads it back.
 * A page load does not query reports or prices.
 * The watchlist row is the durable copy (no new table). A colo cache is only
 * a fallback when that read does not finish in time.
 */
export const TRACK_RECORD_READ_MS = 1_500;
const CACHE_URL = "https://aetherforge.internal/track-scorecard-v1";

export interface ScorecardRows {
  read(ticker: string): Promise<string | null>;
  write(ticker: string, body: string): Promise<void>;
  delete?(ticker: string): Promise<void>;
}

export type TrackRecordLoad =
  | { kind: "ready"; view: TrackRecordView }
  | { kind: "missing" }
  | { kind: "error"; error: string };

let memoryRaw: string | null = null;

function edgeCache(): Cache | null {
  const c = (globalThis as unknown as { caches?: { default?: Cache } }).caches;
  return c?.default ?? null;
}

async function readCache(): Promise<string | null> {
  const cache = edgeCache();
  if (!cache) return null;
  try {
    const hit = await cache.match(new Request(CACHE_URL));
    if (!hit) return null;
    return await hit.text();
  } catch {
    return null;
  }
}

async function writeCache(body: string): Promise<void> {
  const cache = edgeCache();
  if (!cache) return;
  await cache.put(
    new Request(CACHE_URL),
    new Response(body, { headers: { "content-type": "application/json", "cache-control": "max-age=604800" } })
  );
}

async function findRow(ticker: string): Promise<{ id: string; name: string } | null> {
  const res = await totalumSdk.crud.query("watchlist", { _filter: { ticker }, _limit: 5 });
  const rows = ((res as { data?: { _id?: string; ticker?: string; name?: string; user?: unknown }[] })?.data || []);
  // Review fix: only the ownerless system row counts. A member row with this ticker (blocked by
  // POST, but defence in depth) is never read as, or overwritten by, the scorecard.
  const row = rows.find((item) => !item.user && String(item.ticker || "").toUpperCase() === ticker.toUpperCase());
  if (!row?._id) return null;
  return { id: String(row._id), name: typeof row.name === "string" ? row.name : "" };
}

export const liveScorecardRows: ScorecardRows = {
  async read(ticker) {
    const row = await findRow(ticker);
    return row ? row.name : null;
  },
  async write(ticker, body) {
    const existing = await findRow(ticker);
    if (existing) {
      await totalumSdk.crud.editRecordById("watchlist", existing.id, { name: body });
      return;
    }
    await totalumSdk.crud.createRecord("watchlist", {
      ticker,
      name: body,
      asset_type: "stock",
      market: "US",
    });
  },
  async delete(ticker) {
    const existing = await findRow(ticker);
    if (!existing) return;
    await totalumSdk.crud.deleteRecordById("watchlist", existing.id);
  },
};

function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error("error"));
      }
    );
  });
}

type PackedRead = { kind: "missing" } | { kind: "bad" } | { kind: "ok"; raw: string };

async function readPacked(rows: ScorecardRows): Promise<PackedRead> {
  const header = await rows.read(TRACK_SCORECARD_TICKER);
  if (!header) return { kind: "missing" };
  if (header.startsWith("z1:")) {
    const raw = unpackScorecard(header, []);
    return raw ? { kind: "ok", raw } : { kind: "bad" };
  }
  let parts = 0;
  try {
    const manifest = JSON.parse(header) as { parts?: unknown };
    parts = typeof manifest.parts === "number" ? manifest.parts : 0;
  } catch {
    return { kind: "bad" };
  }
  if (parts < 1) return { kind: "bad" };
  const chunks = await Promise.all(Array.from({ length: parts }, (_, i) => rows.read(trackScorecardChunkTicker(i + 1))));
  if (chunks.some((part) => !part)) return { kind: "bad" };
  const raw = unpackScorecard(header, chunks as string[]);
  return raw ? { kind: "ok", raw } : { kind: "bad" };
}

async function previousChunkCount(rows: ScorecardRows): Promise<number> {
  const header = await rows.read(TRACK_SCORECARD_TICKER);
  if (!header || header.startsWith("z1:")) return 0;
  try {
    const parts = (JSON.parse(header) as { parts?: unknown }).parts;
    return typeof parts === "number" && parts > 0 && parts < 1000 ? Math.floor(parts) : 0;
  } catch {
    return 0;
  }
}

async function writePacked(rows: ScorecardRows, json: string): Promise<void> {
  const previous = await previousChunkCount(rows);
  const packed = packScorecard(json);
  if (!packed) throw new Error("scorecard does not fit the store");
  await rows.write(TRACK_SCORECARD_TICKER, packed.header);
  for (let i = 0; i < packed.chunks.length; i++) {
    await rows.write(trackScorecardChunkTicker(i + 1), packed.chunks[i]);
  }
  if (!rows.delete) return;
  const removeUntil = Math.min(40, Math.max(previous, packed.chunks.length));
  for (let i = packed.chunks.length + 1; i <= removeUntil; i++) {
    try {
      await rows.delete(trackScorecardChunkTicker(i));
    } catch {
      /* the new card is already stored */
    }
  }
}

export async function persistTrackRun(
  run: TrackRunSnapshot,
  rows: ScorecardRows = liveScorecardRows,
  storedAt = new Date().toISOString(),
  meta: { builtBy?: "schedule" | "seed"; durationMs?: number | null } = {}
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const snap: StoredTrackRun = snapshotFromRun(run, storedAt);
    if (!(await verifyScorecard(snap.card))) {
      return { ok: false, error: "The scorecard hash did not match its body, so it was not stored." };
    }
    const json = JSON.stringify(snap);
    await writePacked(rows, json);
    // b36 G-20: record who stored this card (the cron or the seed), for "built by schedule".
    if (meta.builtBy) {
      try {
        const log = parseRunLog(await rows.read(TRACK_RUN_LOG_TICKER));
        const next = appendRunLog(log, { at: storedAt, builtBy: meta.builtBy, durationMs: meta.durationMs ?? null, calls: snap.card.calls.length, scorecardHash: snap.card.scorecardHash });
        await rows.write(TRACK_RUN_LOG_TICKER, JSON.stringify(next));
      } catch {
        /* the card is stored; the log is best effort */
      }
    }
    if (rows === liveScorecardRows) {
      memoryRaw = json;
      try {
        await writeCache(json);
      } catch {
        /* the database row is the copy that matters */
      }
    }
    return { ok: true };
  } catch (err) {
    console.warn("[track-record] store:", err instanceof Error ? err.message.slice(0, 120) : "error");
    return { ok: false, error: "The scorecard could not be stored." };
  }
}

async function readyOrError(raw: string): Promise<TrackRecordLoad> {
  const view = await viewFromStoredJson(raw);
  if (!view) return { kind: "error", error: "The stored scorecard could not be read." };
  return { kind: "ready", view };
}

/**
 * Read the stored scorecard. Pass `rows` in tests. The live read waits at
 * most TRACK_RECORD_READ_MS, then uses the last colo cache if one exists.
 */
export async function loadTrackRecordView(rows: ScorecardRows = liveScorecardRows, timeoutMs = TRACK_RECORD_READ_MS): Promise<TrackRecordLoad> {
  try {
    const packed = await withTimeout(readPacked(rows), timeoutMs);
    if (packed.kind === "missing") return { kind: "missing" };
    if (packed.kind === "bad") return { kind: "error", error: "The stored scorecard could not be read." };
    if (rows === liveScorecardRows) memoryRaw = packed.raw;
    return readyOrError(packed.raw);
  } catch {
    if (rows === liveScorecardRows) {
      const fallback = memoryRaw || (await withTimeout(readCache(), 300).catch(() => null));
      if (fallback) return readyOrError(fallback);
    }
    return { kind: "error", error: "The stored scorecard could not be read in time." };
  }
}

/** b36 G-20: the stored run log (newest first). */
export async function readTrackRunLog(rows: ScorecardRows = liveScorecardRows, timeoutMs = TRACK_RECORD_READ_MS): Promise<TrackRunLogEntry[]> {
  try {
    return parseRunLog(await withTimeout(rows.read(TRACK_RUN_LOG_TICKER), timeoutMs));
  } catch {
    return [];
  }
}
