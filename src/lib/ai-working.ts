/**
 * G-19 (b80): "show your working" for AI notes. Every number in a reply is checked against the data the
 * note was given. The note gets source chips with an as-of time, a confidence level and a list of any
 * figures that could not be traced. Pure (no network). Behind AI_SHOW_WORKING (off unless set to "1").
 */
import { formatDisplayDateTime } from "@/lib/currency";

export interface WorkingSource {
  label: string;
  asOf: string | null;
}

export type WorkingConfidence = "High" | "Medium" | "Low";

export interface AiWorking {
  sources: WorkingSource[];
  asOf: string | null;
  confidence: WorkingConfidence;
  checkedNumbers: number;
  unsupported: string[];
}

export const CHALLENGE_PROMPT =
  "Challenge this: for each figure in your last answer, say which line of my portfolio data it came from, and mark anything that was an assumption.";

export const aiShowWorkingEnabled = (env: Record<string, string | undefined> = process.env) =>
  env.AI_SHOW_WORKING === "1";

const NUMBER = /-?(?:NZ|US|A)?\$?\s?\d[\d,]*(?:\.\d+)?\s?%?/g;

function parse(token: string): { value: number; decimals: number; pct: boolean } | null {
  const pct = token.trim().endsWith("%");
  const clean = token.replace(/[^\d.-]/g, "");
  const value = Number(clean);
  if (!Number.isFinite(value)) return null;
  const dot = clean.indexOf(".");
  return { value, decimals: dot < 0 ? 0 : clean.length - dot - 1, pct };
}

/** Numbers a reader would treat as data. Years, list numbers and small counts are left out. */
function dataNumbers(text: string): Array<{ raw: string; value: number; decimals: number }> {
  const out: Array<{ raw: string; value: number; decimals: number }> = [];
  for (const line of text.split("\n")) {
    const stripped = line.replace(/^\s*\d+[.)]\s+/, "");
    for (const m of stripped.matchAll(NUMBER)) {
      const raw = m[0].trim();
      const p = parse(raw);
      if (!p) continue;
      const abs = Math.abs(p.value);
      const money = /\$/.test(raw);
      if (!p.pct && !money && p.decimals === 0 && (abs <= 12 || (abs >= 1900 && abs <= 2100))) continue;
      out.push({ raw, value: p.value, decimals: p.decimals });
    }
  }
  return out;
}

/** A reply figure is supported when a context figure rounds to it (to the reply's own precision). */
function supported(n: { value: number; decimals: number }, pool: number[]): boolean {
  const step = Math.pow(10, -n.decimals);
  return pool.some((c) => {
    for (const v of [c, -c]) {
      if (Math.abs(v - n.value) <= step / 2 + 1e-9) return true;
      // "about NZ$12k" style rounding of a larger figure: within 0.5% and same sign.
      if (Math.abs(n.value) >= 1000 && Math.abs(v - n.value) <= Math.abs(v) * 0.005) return true;
    }
    return false;
  });
}

export function showWorking(
  reply: string,
  context: string,
  opts: { asOf?: string | Date | null; sourceLabel?: string } = {}
): AiWorking {
  const pool = dataNumbers(context).map((n) => n.value);
  const nums = dataNumbers(reply);
  const unsupported = [...new Set(nums.filter((n) => !supported(n, pool)).map((n) => n.raw))];
  const asOf = opts.asOf ? formatDisplayDateTime(opts.asOf) : null;
  const confidence: WorkingConfidence =
    unsupported.length === 0 ? (nums.length > 0 ? "High" : "Medium") : unsupported.length <= 1 && nums.length >= 4 ? "Medium" : "Low";
  return {
    sources: [{ label: opts.sourceLabel || "Your portfolio", asOf }],
    asOf,
    confidence,
    checkedNumbers: nums.length,
    unsupported,
  };
}

/** Latest price time across holdings, for the as-of chip. */
export function latestAsOf(rows: ReadonlyArray<{ updatedAt?: string | null }>): string | null {
  let best: number | null = null;
  for (const r of rows) {
    const t = r.updatedAt ? Date.parse(r.updatedAt) : NaN;
    if (Number.isFinite(t) && (best == null || t > best)) best = t;
  }
  return best == null ? null : new Date(best).toISOString();
}
