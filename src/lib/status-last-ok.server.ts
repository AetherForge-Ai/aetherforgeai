import "server-only";
import { totalumSdk } from "@/lib/totalum";
import { keepAlive } from "@/lib/keep-alive.server";

/**
 * M-2 (P2): the last OK time per /status feed survives redeploys. No new Totalum table: one ownerless
 * hidden row in the existing `watchlist` table (ticker AF-SLO, a JSON map in `name`), like AF-CAT.
 * Only provider timestamps are stored; nothing is invented.
 */
export const STATUS_LAST_OK_TICKER = "AF-SLO";
/** At most one store write per feed per isolate in this window (newer times only). */
export const STATUS_LAST_OK_WRITE_GAP_MS = 10 * 60_000;

export type StatusLastOkMap = Partial<Record<string, string>>;
type Row = { _id?: string; ticker?: string; name?: string; user?: unknown };

/** Keeps only parseable ISO times; anything else is dropped. */
export function parseStatusLastOk(raw: string | null | undefined): StatusLastOkMap {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const out: StatusLastOkMap = {};
    for (const [key, at] of Object.entries(value as Record<string, unknown>)) {
      if (typeof at === "string" && Number.isFinite(Date.parse(at))) out[key] = at;
    }
    return out;
  } catch {
    return {};
  }
}

/** The newer time per feed from two maps. */
export function mergeStatusLastOk(a: StatusLastOkMap, b: StatusLastOkMap): StatusLastOkMap {
  const out: StatusLastOkMap = { ...a };
  for (const [key, at] of Object.entries(b)) {
    if (!at) continue;
    const prev = out[key];
    if (!prev || Date.parse(at) > Date.parse(prev)) out[key] = at;
  }
  return out;
}

async function findRow(): Promise<Row | null> {
  const res = await totalumSdk.crud.query("watchlist", { _filter: { ticker: STATUS_LAST_OK_TICKER }, _limit: 5 });
  const rows = ((res as { data?: Row[] })?.data || []) as Row[];
  return rows.find((r) => !r.user && String(r.ticker || "").toUpperCase() === STATUS_LAST_OK_TICKER) ?? null;
}

let cached: StatusLastOkMap | null = null;
const writtenAt: Record<string, number> = {};

export async function readStatusLastOk(): Promise<StatusLastOkMap> {
  if (cached) return cached;
  try {
    cached = parseStatusLastOk((await findRow())?.name);
  } catch {
    return {};
  }
  return cached;
}

async function writeNow(update: StatusLastOkMap): Promise<void> {
  const row = await findRow();
  const merged = mergeStatusLastOk(parseStatusLastOk(row?.name), update);
  cached = mergeStatusLastOk(cached ?? {}, merged);
  const name = JSON.stringify(merged);
  if (row?._id) {
    if (row.name !== name) await totalumSdk.crud.editRecordById("watchlist", String(row._id), { name });
  } else {
    await totalumSdk.crud.createRecord("watchlist", { ticker: STATUS_LAST_OK_TICKER, name, asset_type: "stock", market: "NZX" });
  }
}

/** Background, throttled save of newer times. Never blocks the page. */
export function saveStatusLastOk(key: string, at: string | null | undefined, now = Date.now()): void {
  if (!at || !Number.isFinite(Date.parse(at))) return;
  const known = cached?.[key];
  if (known && Date.parse(known) >= Date.parse(at)) return;
  if (writtenAt[key] && now - writtenAt[key] < STATUS_LAST_OK_WRITE_GAP_MS) return;
  writtenAt[key] = now;
  void keepAlive(writeNow({ [key]: at }).catch(() => undefined));
}

export function resetStatusLastOkForTests() {
  cached = null;
  for (const key of Object.keys(writtenAt)) delete writtenAt[key];
}
