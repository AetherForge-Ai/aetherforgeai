/**
 * Header and bearer only. A query key or secret is not a credential for the crypto snapshot route.
 * pull-check:v3-tier1a-2026-10-12
 */

export function presentedHeaderCronSecret(headers: { get(name: string): string | null }): string | null {
  const header = headers.get("x-cron-secret");
  if (header && header.trim()) return header.trim();
  const auth = headers.get("authorization");
  if (!auth) return null;
  const match = /^Bearer\s+(\S+)/i.exec(auth.trim());
  return match?.[1] ?? null;
}

/** Equal-length buffers for crypto.timingSafeEqual. A length mismatch is a miss, not a throw. */
export function cronSecretBuffers(
  secret: string,
  presented: string | null
): { expected: Buffer; presented: Buffer } | null {
  if (!secret || presented == null || presented === "") return null;
  const expected = Buffer.from(secret);
  const given = Buffer.from(presented);
  if (expected.length !== given.length) return null;
  return { expected, presented: given };
}
