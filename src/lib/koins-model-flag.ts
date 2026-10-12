/**
 * Koins model changes stay off on the live site.
 * Crypto projections are paused separately and are not turned on here.
 * Set KOINS_MODEL_V2=on only for a measured check, not for the public pages.
 */

export function koinsModelV2Enabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.KOINS_MODEL_V2 === "on";
}
