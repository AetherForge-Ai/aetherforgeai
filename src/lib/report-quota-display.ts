import { formatDisplayDate } from "@/lib/currency";
import { aucklandMonthKey } from "@/lib/entitlements";

export const QUOTA_NOT_LOADED = "Quota has not loaded.";

export interface ReportRunControl {
  disabled: boolean;
  title: string;
  label: string;
}

export interface ReportDeskSnapshot {
  loaded: boolean;
  text: string;
  reason: string | null;
  run: (kind: "stock" | "crypto") => void;
  stox: ReportRunControl;
  koins: ReportRunControl;
}

/** First day of the next month after an Auckland yyyy-MM bucket, as "1 Nov 2026". */
export function nextAucklandMonthLabel(monthKey: string | null | undefined): string | null {
  const match = /^(\d{4})-(\d{2})$/.exec(String(monthKey || ""));
  if (!match) return null;
  let year = Number(match[1]);
  let month = Number(match[2]);
  if (!year || month < 1 || month > 12) return null;
  if (month === 12) {
    year += 1;
    month = 1;
  } else {
    month += 1;
  }
  const label = formatDisplayDate(`${year}-${String(month).padStart(2, "0")}-01`);
  return label === "—" ? null : label;
}

export function headerQuotaCopy(input: {
  loaded: boolean;
  remaining: number | null;
  limit: number | null;
  monthKey: string | null;
  nextAllowedAt: string | null;
  monthly: boolean;
}): { text: string; reason: string | null } {
  if (!input.loaded) return { text: "—", reason: QUOTA_NOT_LOADED };
  if (input.remaining == null || input.limit == null || !input.monthly) {
    return { text: "—", reason: "This plan does not publish a monthly report count." };
  }
  const fromNext = input.nextAllowedAt ? formatDisplayDate(input.nextAllowedAt) : null;
  const reset = fromNext && fromNext !== "—" ? fromNext : nextAucklandMonthLabel(input.monthKey);
  if (!reset) return { text: "—", reason: "The quota reset date was not on this response." };
  return { text: `${input.remaining} of ${input.limit} left this month. Resets ${reset}.`, reason: null };
}

export function reportRunControl(input: {
  loaded: boolean;
  name: "Stox" | "Koins";
  allowed: boolean | null;
  remaining: number | null;
  limit: number | null;
  cooldown: string | null;
  blockedReason?: string | null;
}): ReportRunControl {
  const count =
    input.loaded && input.remaining != null && input.limit != null ? ` · ${input.remaining} of ${input.limit} left` : "";
  const label = `Run ${input.name} report${count}`;
  if (!input.loaded || input.allowed == null) {
    return { disabled: true, title: QUOTA_NOT_LOADED, label: `Run ${input.name} report` };
  }
  if (input.blockedReason) return { disabled: true, title: input.blockedReason, label };
  if (!input.allowed || input.remaining === 0) {
    return { disabled: true, title: input.cooldown || "No reports left this month.", label };
  }
  return { disabled: false, title: `Run ${input.name} report`, label };
}

export function unloadedReportControl(name: "Stox" | "Koins"): ReportRunControl {
  return reportRunControl({ loaded: false, name, allowed: null, remaining: null, limit: null, cooldown: null });
}

/** Auckland month bucket for a monthly allowance when the response did not send monthKey. */
export function monthlyBucketKey(now = Date.now()): string {
  return aucklandMonthKey(now);
}
