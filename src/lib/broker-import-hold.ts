/**
 * Unrecognised import files are held only with consent.
 * The copy stays in this server process so a later request on the same
 * process can read it. It is not emailed and it is not written to the account store.
 *
 * pull-check:batch2-2026-10-11 B2-1
 */

import { createHash } from "node:crypto";

export interface SupportHold {
  kept: boolean;
  reason: string;
  sha256?: string;
  bytes?: number;
}

const MAX_HOLDS = 20;
const held = new Map<string, { text: string; at: string }>();

export function supportHold(text: string, consent: boolean): SupportHold {
  const body = text || "";
  if (!consent) return { kept: false, reason: "Not kept. Consent was not given." };
  if (!body.trim()) return { kept: false, reason: "Not kept. The file is empty." };
  const sha256 = createHash("sha256").update(body).digest("hex");
  held.set(sha256, { text: body, at: new Date().toISOString() });
  while (held.size > MAX_HOLDS) {
    const oldest = held.keys().next().value;
    if (!oldest) break;
    held.delete(oldest);
  }
  return {
    kept: true,
    reason: "Kept for support on this server process. It is not emailed.",
    sha256,
    bytes: Buffer.byteLength(body),
  };
}

/** Server-side read. Absent when consent was not given or the process restarted. */
export function readSupportHold(sha256: string): string | null {
  return held.get(sha256)?.text ?? null;
}
