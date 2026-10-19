/**
 * b48 H-1 (Chief ruling: Worker logs are not reachable). /api/ticker reports on itself in headers:
 *  - x-af-ticker-path: which branch produced the reply (TICKER_PATHS)
 *  - x-af-snapshot-age: seconds between the snapshot's own time and the reply
 *  - x-af-snapshot-version: the snapshot version served
 *  - x-af-503-reason (503 only): which reads failed or timed out, with ms
 * No secrets, cookies, user ids or addresses are ever put in these headers.
 */
export const TICKER_PATHS = [
  "snapshot-hit", // the build used this isolate's snapshot read (memory or its normal store check)
  "cold", // the build ran in a cold isolate and used the longer stored-copy read
  "shared-cache", // the colo (Cache API) copy
  "store-read", // the stored DB copy read by the fallback
  "floor-version", // the client's floor version (colo by version, stored copy, or a held newer copy)
  "deadline", // the build missed the early deadline; this isolate's last snapshot or reply was served
  "last-good", // after every read came back empty: this isolate's or the colo's last good reply
  "late-durable", // the last stored-copy read before a 503
] as const;
export type TickerPath = (typeof TICKER_PATHS)[number];

export const TICKER_EXPOSED_HEADERS = [
  "x-af-ticker-path",
  "x-af-snapshot-age",
  "x-af-snapshot-version",
  "x-af-snapshot-at",
  "x-af-snapshot-stale",
  "x-af-snapshot-below-floor",
  "x-af-503-reason",
].join(", ");

/** The self-report headers for a reply built from a snapshot with this version and time. */
export function tickerPathHeaders(
  path: TickerPath,
  snap: { version?: number | null; at?: string | null } | null,
  now = Date.now()
): Record<string, string> {
  const at = Date.parse(snap?.at || "");
  const out: Record<string, string> = {
    "x-af-ticker-path": path,
    "Access-Control-Expose-Headers": TICKER_EXPOSED_HEADERS,
  };
  if (snap?.version) out["x-af-snapshot-version"] = String(snap.version);
  if (Number.isFinite(at)) out["x-af-snapshot-age"] = String(Math.max(0, Math.round((now - at) / 1000)));
  return out;
}

const SAFE_VALUE = /^[a-z0-9-]{1,24}$/;
/**
 * The 503 reason: each read's outcome and the total ms, e.g.
 * "build=null edge=miss durable=timeout lateDurable=miss ms=4312". Keys and values are allow-listed
 * shapes (short lowercase words), so nothing else can leak into the header.
 */
export function tickerReason(trace: Record<string, string>, ms: number): string {
  const parts = Object.entries(trace)
    .filter(([k, v]) => /^[a-zA-Z]{1,24}$/.test(k) && SAFE_VALUE.test(v))
    .map(([k, v]) => `${k}=${v}`);
  return [...parts, `ms=${Math.max(0, Math.round(ms))}`].join(" ");
}

/** Apply the headers to an existing Response (NextResponse headers are mutable). */
export function stampTicker<R extends Response>(res: R, headers: Record<string, string>): R {
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
  return res;
}
