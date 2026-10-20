/**
 * G-28 (GOAL-LOCK row 63): server-side onboarding funnel. Locked: funnel tracked; no gambling-style wording.
 * Write-only events, validated names, no IP stored, anonymous events only after cookie consent.
 */
export const FUNNEL_EVENTS = ["view", "quiz_start", "quiz_result", "checklist_step", "signup"] as const;
export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];
export const FUNNEL_COOKIE = "af_funnel_anon";
const KEY_RE = /^[a-z0-9_-]{1,40}$/;
const ANON_RE = /^[A-Za-z0-9_-]{22,64}$/;

export interface FunnelRow {
  user: string | null;
  anon_id: string | null;
  event: FunnelEvent;
  step_key: string;
  plan_result: string;
}

/** Crypto random anon id (never Math.random). */
export function newAnonId(): string {
  const b = new Uint8Array(18);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export type FunnelDecision = { write: true; row: FunnelRow } | { write: false; reason: "bad_event" | "no_consent" | "bad_field" };

export function funnelRow(input: { event: unknown; stepKey?: unknown; planResult?: unknown; userId: string | null; anonId: string | null; consent: boolean }): FunnelDecision {
  const event = String(input.event || "") as FunnelEvent;
  if (!FUNNEL_EVENTS.includes(event)) return { write: false, reason: "bad_event" };
  const step = String(input.stepKey ?? "");
  const plan = String(input.planResult ?? "");
  if ((step && !KEY_RE.test(step)) || (plan && !KEY_RE.test(plan))) return { write: false, reason: "bad_field" };
  // H-15 cookie rule: declined cookies = no anon id and no anonymous events; signed-in events still count.
  const anon = input.consent && input.anonId && ANON_RE.test(input.anonId) ? input.anonId : null;
  if (!input.userId && !anon) return { write: false, reason: "no_consent" };
  return { write: true, row: { user: input.userId, anon_id: input.userId ? null : anon, event, step_key: step, plan_result: plan } };
}

/** Simple per-key fixed window limiter (per isolate). */
export function makeLimiter(max: number, windowMs: number) {
  const hits = new Map<string, { n: number; start: number }>();
  return (key: string, now = Date.now()): boolean => {
    const h = hits.get(key);
    if (!h || now - h.start >= windowMs) {
      hits.set(key, { n: 1, start: now });
      return true;
    }
    h.n += 1;
    return h.n <= max;
  };
}

/** Admin aggregate: counts per event. Never returns rows or ids. */
export function aggregate(rows: readonly Pick<FunnelRow, "event">[]): Record<FunnelEvent, number> {
  const out = Object.fromEntries(FUNNEL_EVENTS.map((e) => [e, 0])) as Record<FunnelEvent, number>;
  for (const r of rows) if (FUNNEL_EVENTS.includes(r.event)) out[r.event] += 1;
  return out;
}
