/**
 * b7 CR-2 / CR-5: Cloudflare Workers Rate Limiting binding.
 * The Totalum counter and the memory map are not atomic across isolates, so a
 * parallel burst could land on 8 fresh isolates and all pass. The Workers
 * binding counts at the edge for every isolate in the location.
 * Returns true (allowed), false (refused) or null (binding not available:
 * local dev, tests, or a deploy without the binding) so callers fall back.
 */
export type EdgeLimiterName = "GUIDE_RATE_LIMITER" | "GUIDE48_RATE_LIMITER" | "AUTH_RATE_LIMITER" | "AUTH_EMAIL_RATE_LIMITER";

type Limiter = { limit(opts: { key: string }): Promise<{ success: boolean }> };

export async function edgeRateLimit(name: EdgeLimiterName, key: string): Promise<boolean | null> {
  try {
    const mod = (await import("@opennextjs/cloudflare")) as unknown as {
      getCloudflareContext?: () => { env?: Record<string, unknown> };
    };
    const env = mod.getCloudflareContext?.().env;
    const limiter = env?.[name] as Limiter | undefined;
    if (!limiter || typeof limiter.limit !== "function") return null;
    const { success } = await limiter.limit({ key });
    return !!success;
  } catch {
    return null;
  }
}
