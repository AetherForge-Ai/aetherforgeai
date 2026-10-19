import { formatNzd } from "@/lib/currency";

/**
 * b43 P2 (TT: the dashboard AI report said "Cash on book NZ$100.00" while the ledger had NZ$0.00).
 * A stored report's cash line is shown with the SAME ledger balance the dashboard shows. When the
 * figure the report ran with differs, it stays visible as "(NZ$X when this report ran on <date>)".
 */
const CASH_ON_BOOK = /(Cash on book(?: is|:)?\s*)(NZ\$\s?-?[\d,]+(?:\.\d+)?)/gi;

function runDate(runAt: string | null | undefined): string {
  const t = Date.parse(runAt || "");
  if (!Number.isFinite(t)) return "";
  return ` on ${new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", day: "numeric", month: "short", year: "numeric" }).format(new Date(t))}`;
}

export function reconcileCashOnBook(text: string, liveCashNzd: number | null | undefined, runAt?: string | null): string {
  if (!text || liveCashNzd == null || !Number.isFinite(liveCashNzd)) return text;
  return text.replace(CASH_ON_BOOK, (whole, pre: string, amount: string) => {
    const was = Number(amount.replace(/[^\d.-]/g, ""));
    if (Number.isFinite(was) && Math.abs(was - liveCashNzd) < 0.005) return whole;
    return `${pre}${formatNzd(liveCashNzd)} (${amount.replace(/\s/g, "")} when this report ran${runDate(runAt)})`;
  });
}

/** Every string in a stored report payload, with its cash-on-book line reconciled. */
export function reconcileReportCash<T>(value: T, liveCashNzd: number | null | undefined, runAt?: string | null): T {
  if (liveCashNzd == null) return value;
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return reconcileCashOnBook(v, liveCashNzd, runAt);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value) as T;
}
