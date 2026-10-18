/**
 * Goal b19 G-20 (collect only): the AI track record. Each buy/sell-style call in
 * a saved report becomes a hashed record; a weekly scorecard counts hits,
 * misses (losers included) and pending calls, and is hashed too so a later
 * publication can be verified. Nothing is published: there is no public page,
 * and numbers are shown only once real later prices exist.
 */
export type CallDirection = "up" | "down" | "neutral";
export interface TrackCall {
  reportId: string;
  bot: string;
  ticker: string;
  signal: string;
  direction: CallDirection;
  priceAtCall: number;
  issuedAt: string;
  hash: string;
}

const UP = new Set(["Strong Buy", "Buy", "Accumulate"]);
const DOWN = new Set(["Reduce", "Sell"]);
export const directionOf = (signal: string): CallDirection => (UP.has(signal) ? "up" : DOWN.has(signal) ? "down" : "neutral");

export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type ReportRow = { _id?: string; bot?: string; generated_at?: string; payload?: string };

export async function extractCalls(row: ReportRow): Promise<TrackCall[]> {
  let payload: { tickers?: Array<{ ticker?: string; price?: number; signal?: string; priceUnavailable?: boolean }> } = {};
  try {
    payload = JSON.parse(row.payload || "{}");
  } catch {
    return [];
  }
  const out: TrackCall[] = [];
  for (const t of payload.tickers ?? []) {
    if (!t?.ticker || !t.signal || t.priceUnavailable || !(Number(t.price) > 0) || !row.generated_at) continue;
    const base = {
      reportId: String(row._id ?? ""),
      bot: String(row.bot ?? ""),
      ticker: t.ticker,
      signal: t.signal,
      direction: directionOf(t.signal),
      priceAtCall: Number(t.price),
      issuedAt: row.generated_at,
    };
    out.push({ ...base, hash: await sha256Hex(canonical(base)) });
  }
  return out;
}

export async function verifyCall(call: TrackCall): Promise<boolean> {
  const { hash, ...base } = call;
  return (await sha256Hex(canonical(base))) === hash;
}

/** Hit = price moved the called way after 7 days. Neutral calls are listed, not scored. */
export function scoreCall(call: TrackCall, priceAfter7d: number | null): "hit" | "miss" | "pending" | "unscored" {
  if (call.direction === "neutral") return "unscored";
  if (priceAfter7d == null || !(priceAfter7d > 0)) return "pending";
  const up = priceAfter7d > call.priceAtCall;
  return (call.direction === "up") === up ? "hit" : "miss";
}

export async function weeklyScorecard(week: string, calls: readonly TrackCall[], laterPrices: Readonly<Record<string, number | null>>) {
  const scored = calls.map((c) => ({ hash: c.hash, ticker: c.ticker, signal: c.signal, result: scoreCall(c, laterPrices[c.hash] ?? null) }));
  const count = (r: string) => scored.filter((s) => s.result === r).length;
  const body = { week, calls: scored, hits: count("hit"), misses: count("miss"), pending: count("pending"), unscored: count("unscored") };
  return { ...body, scorecardHash: await sha256Hex(canonical(body)), published: false as const };
}

/**
 * Goal b20: the day whose close scores a call — 7 days after it was issued
 * (Auckland date). Null until that day has fully passed, so a call is never
 * scored on a price that is still moving.
 */
export function laterPriceDay(call: Pick<TrackCall, "issuedAt">, now = Date.now()): string | null {
  const issued = Date.parse(call.issuedAt);
  if (!Number.isFinite(issued)) return null;
  const target = issued + 7 * 86400_000;
  if (target + 86400_000 > now) return null;
  return new Date(target).toLocaleDateString("en-CA", { timeZone: "Pacific/Auckland" });
}
