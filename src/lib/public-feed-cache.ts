/**
 * In-memory cache for public price feeds.
 * Client fetches use cache: "no-store", so a browser HTTP cache cannot
 * collapse the session check and the later spot/index read. This map can.
 * Private book routes are not stored here.
 */

type FeedResponse<T = unknown> = {
  ok: boolean;
  data?: T;
  error?: unknown;
  status?: number;
  aborted?: boolean;
};

const TTL_MS = 45_000;
const PATHS = ["/api/metals/spot", "/api/market-snapshot"] as const;

type Cached = { at: number; promise: Promise<FeedResponse<unknown>> };

const memory = new Map<string, Cached>();

export function publicFeedPath(url: string): string | null {
  const path = url.split("?")[0];
  return (PATHS as readonly string[]).includes(path) ? path : null;
}

export function readPublicFeed<T>(url: string): Promise<FeedResponse<T>> | null {
  const path = publicFeedPath(url);
  if (!path) return null;
  const hit = memory.get(path);
  if (!hit || Date.now() - hit.at > TTL_MS) return null;
  return hit.promise as Promise<FeedResponse<T>>;
}

export function rememberPublicFeed<T>(url: string, promise: Promise<FeedResponse<T>>): void {
  const path = publicFeedPath(url);
  if (!path) return;
  memory.set(path, { at: Date.now(), promise: promise as Promise<FeedResponse<unknown>> });
}

/** Start the public feeds. Does not await them and does not touch the paper book. */
export function warmPublicFeeds(): void {
  if (typeof window === "undefined") return;
  for (const path of PATHS) {
    if (readPublicFeed(path)) continue;
    const promise = fetch(path, { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        const text = await res.text();
        let json: FeedResponse<unknown> = { ok: false, status: res.status };
        try {
          json = JSON.parse(text) as FeedResponse<unknown>;
        } catch {
          json = { ok: false, status: res.status, error: "Feed did not return JSON." };
        }
        json.status = res.status;
        if (!res.ok) json.ok = false;
        return json;
      })
      .catch((err: unknown) => ({
        ok: false as const,
        error: err instanceof Error ? err.message : "Feed unavailable",
      }));
    rememberPublicFeed(path, promise);
  }
}
