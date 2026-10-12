/**
 * Starts the paper-book reads while the dashboard session check is in flight.
 * The later loaders reuse the body so the first paint does not wait for a
 * second round trip. Private routes stay out of the public feed cache.
 */

type BookBody = { ok?: boolean; data?: unknown; userId?: string; status?: number };

const TTL_MS = 15_000;
const memory = new Map<string, { at: number; promise: Promise<BookBody> }>();

const PATHS = ["/api/portfolio/snapshot", "/api/transactions", "/api/stocks"] as const;

function pathOf(url: string): string {
  return url.split("?")[0];
}

export function prefetchDashboardBook(): void {
  if (typeof window === "undefined") return;
  for (const path of PATHS) {
    const hit = memory.get(path);
    if (hit && Date.now() - hit.at < TTL_MS) continue;
    const promise = fetch(path, { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        let json: BookBody = { ok: false, status: res.status };
        try {
          json = JSON.parse(await res.text()) as BookBody;
        } catch {
          json = { ok: false, status: res.status };
        }
        json.status = res.status;
        if (!res.ok) json.ok = false;
        return json;
      })
      .catch(() => ({ ok: false }));
    memory.set(path, { at: Date.now(), promise });
  }
}

/** One-shot read of a prefetch that is still fresh. Later loads hit the network. */
export function takeDashboardPrefetch(url: string): Promise<BookBody> | null {
  const path = pathOf(url);
  if (!(PATHS as readonly string[]).includes(path)) return null;
  const hit = memory.get(path);
  if (!hit || Date.now() - hit.at > TTL_MS) return null;
  memory.delete(path);
  return hit.promise;
}
