/**
 * b24 G-05: keep background work alive after the response on Cloudflare Workers.
 * A detached promise is cancelled when the Worker returns, so the crypto list refresh
 * never landed. ctx.waitUntil keeps it running; outside Workers the promise just runs.
 */
export async function keepAlive(work: Promise<unknown>): Promise<"waitUntil" | "detached"> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const ctx = getCloudflareContext().ctx as { waitUntil?: (p: Promise<unknown>) => void } | undefined;
    if (ctx?.waitUntil) {
      ctx.waitUntil(work.catch(() => undefined));
      return "waitUntil";
    }
  } catch {
    /* not on Workers (local next start, tests) */
  }
  void work.catch(() => undefined);
  return "detached";
}
