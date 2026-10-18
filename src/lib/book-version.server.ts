import "server-only";
import { totalumSdk } from "@/lib/totalum";
import { onBookInvalidated } from "@/lib/book-cache";
import { keepAlive } from "@/lib/keep-alive.server";

/**
 * b30 G-10: per-user book version in the durable store, so a write on one device is seen by
 * every isolate and every other device (the af_bw cookie only covers the browser that wrote).
 * No new Totalum column: a hidden `watchlist` row owned by the member, ticker AF-BV, value in
 * `name` as JSON { v, at }. Every book write bumps it; a cached book whose read started before
 * `at` is not served. Reads are memoised for BOOK_VERSION_MEMO_MS and bounded by a timeout.
 */
export const BOOK_VERSION_TICKER = "AF-BV";
export const BOOK_VERSION_MEMO_MS = 1_000;
export const BOOK_VERSION_READ_TIMEOUT_MS = 400;

type Row = { _id?: string; ticker?: string; name?: string; user?: unknown };
export type BookVersion = { v: number; at: number };

const memo = new Map<string, { checked: number; value: BookVersion }>();

function ownerOf(row: Row): string {
  const u = row.user as unknown;
  if (typeof u === "string") return u;
  if (u && typeof u === "object") return String((u as { _id?: string })._id || "");
  return "";
}

export function parseBookVersion(raw: string | null | undefined): BookVersion {
  try {
    const p = JSON.parse(String(raw || "")) as { v?: unknown; at?: unknown };
    const v = typeof p.v === "number" && Number.isFinite(p.v) ? p.v : 0;
    const at = typeof p.at === "number" && Number.isFinite(p.at) ? p.at : 0;
    return { v, at };
  } catch {
    return { v: 0, at: 0 };
  }
}

async function findRow(userId: string): Promise<Row | null> {
  const res = await totalumSdk.crud.query("watchlist", { _filter: { ticker: BOOK_VERSION_TICKER, user: userId }, _limit: 5 });
  const rows = ((res as { data?: Row[] })?.data || []) as Row[];
  return rows.find((r) => ownerOf(r) === userId && String(r.ticker || "").toUpperCase() === BOOK_VERSION_TICKER) ?? null;
}

export async function readBookVersion(userId: string, now = Date.now()): Promise<BookVersion> {
  const hit = memo.get(userId);
  if (hit && now - hit.checked < BOOK_VERSION_MEMO_MS) return hit.value;
  const work = findRow(userId).then((row) => parseBookVersion(row?.name));
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), BOOK_VERSION_READ_TIMEOUT_MS));
  const value = await Promise.race([work.catch(() => null), timeout]);
  if (!value) return hit?.value ?? { v: 0, at: 0 };
  const best = hit && hit.value.at > value.at ? hit.value : value;
  memo.set(userId, { checked: now, value: best });
  return best;
}

export async function bumpBookVersion(userId: string, now = Date.now()): Promise<BookVersion> {
  const row = await findRow(userId);
  const prev = parseBookVersion(row?.name);
  const next = { v: prev.v + 1, at: Math.max(now, prev.at + 1) };
  const name = JSON.stringify(next);
  if (row?._id) await totalumSdk.crud.editRecordById("watchlist", String(row._id), { name });
  else await totalumSdk.crud.createRecord("watchlist", { ticker: BOOK_VERSION_TICKER, name, user: userId, asset_type: "stock", market: "NZX" });
  memo.set(userId, { checked: now, value: next });
  return next;
}

/** Book writes call invalidateBookCache; this registers the durable bump on that hook. */
onBookInvalidated((userId) => {
  const at = Date.now();
  memo.set(userId, { checked: at, value: { v: (memo.get(userId)?.value.v ?? 0) + 1, at } });
  void keepAlive(bumpBookVersion(userId, at).catch((err) => {
    console.warn("[book-version] bump failed:", err instanceof Error ? err.message.slice(0, 80) : "failed");
  }));
});
