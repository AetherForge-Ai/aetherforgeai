/**
 * Web push stays off unless both VAPID keys are present.
 * This module does not invent a key and does not subscribe.
 *
 * pull-check:batch2-2026-10-11 B2-9
 */

export function webPushConfigured(env: Record<string, string | undefined> = process.env): boolean {
  const pub = env.VAPID_PUBLIC_KEY?.trim();
  const priv = env.VAPID_PRIVATE_KEY?.trim();
  return Boolean(pub && priv);
}
