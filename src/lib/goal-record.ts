/**
 * b28 H-11: one shape for a stored goal. Existing columns only (no new Totalum column):
 * every projection input is also kept as JSON in the `label` text column, so the start amount
 * and the plain target date survive a reload even though the table has no start column and
 * returns `target_date` as an ISO timestamp.
 */
export type GoalFields = {
  label: string;
  target_nzd: number;
  target_date: string; // YYYY-MM-DD, a calendar date with no time zone
  monthly_nzd: number;
  annual_return_pct: number;
  start_nzd: number | null;
};
export type GoalRecord = GoalFields & { _id: string };

const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A stored date as YYYY-MM-DD in Pacific/Auckland. A plain date is kept as is (no shift). */
export function plainGoalDate(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : v instanceof Date ? v.toISOString() : "";
  if (PLAIN_DATE.test(s)) return s;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Auckland", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
}

/** "2031-01-01" → "1 Jan 2031". */
export function formatGoalDate(ymd: string): string {
  if (!PLAIN_DATE.test(ymd)) return "—";
  const [y, m, d] = ymd.split("-").map(Number);
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1];
  return `${d} ${mon} ${y}`;
}

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : null;
};

export function encodeGoalLabel(f: GoalFields): string {
  return JSON.stringify({ v: 1, ...f });
}

/** Normalise a raw `goal` row (old or new) into GoalRecord. The JSON copy wins over columns. */
export function normalizeGoalRow(row: Record<string, unknown>): GoalRecord {
  let j: Partial<GoalFields> & { v?: number } = {};
  const rawLabel = typeof row.label === "string" ? row.label : "";
  if (rawLabel.startsWith("{")) {
    try {
      j = JSON.parse(rawLabel);
    } catch {
      j = {};
    }
  }
  const pick = (k: keyof GoalFields) => (j.v === 1 && j[k] !== undefined ? j[k] : row[k]);
  return {
    _id: String(row._id ?? ""),
    label: String((j.v === 1 ? j.label : rawLabel) || "Goal"),
    target_nzd: num(pick("target_nzd")) ?? NaN,
    target_date: plainGoalDate(pick("target_date")),
    monthly_nzd: num(pick("monthly_nzd")) ?? 0,
    annual_return_pct: num(pick("annual_return_pct")) ?? 0,
    start_nzd: num(pick("start_nzd")),
  };
}

/** Why a stored goal cannot be projected, or null. */
export function goalMissingField(g: GoalRecord): string | null {
  if (!(g.target_nzd > 0)) return "target";
  if (!g.target_date) return "target date";
  if (g.start_nzd == null) return "starting amount";
  return null;
}
