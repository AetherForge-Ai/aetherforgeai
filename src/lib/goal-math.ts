/**
 * H-11 goal maths (pure). Storage is blocked until Lukas adds the Totalum
 * `goal` table (spec in docs/goals-table-spec.md), so the UI stays behind
 * HEADMASTER_GOALS (default off). Ranges are illustrative, not a forecast.
 */
export interface GoalInput {
  targetNzd: number;
  targetDate: string; // yyyy-mm-dd
  monthlyNzd: number;
  bookNzd: number;
  annualReturnPct: number;
}

export function monthsUntil(targetDate: string, now = new Date()): number {
  const t = new Date(`${targetDate}T00:00:00Z`);
  if (Number.isNaN(t.getTime())) return NaN;
  return (t.getUTCFullYear() - now.getUTCFullYear()) * 12 + (t.getUTCMonth() - now.getUTCMonth());
}

/** Future value: book compounding monthly plus an end-of-month contribution. Same as spreadsheet FV(). */
export function futureValue(bookNzd: number, monthlyNzd: number, months: number, annualReturnPct: number): number {
  const r = annualReturnPct / 100 / 12;
  if (r === 0) return bookNzd + monthlyNzd * months;
  const g = Math.pow(1 + r, months);
  return bookNzd * g + monthlyNzd * ((g - 1) / r);
}

export function validateGoal(g: GoalInput, now = new Date()): string | null {
  if (!(g.targetNzd > 0)) return "Enter a target above NZ$0.";
  const months = monthsUntil(g.targetDate, now);
  if (!Number.isFinite(months)) return "Enter a valid date.";
  if (months <= 0) return "Choose a date in the future.";
  if (g.monthlyNzd < 0) return "The monthly amount cannot be negative.";
  if (g.bookNzd < 0) return "The book value cannot be negative.";
  if (g.bookNzd >= g.targetNzd) return "Your book has already reached this goal.";
  if (g.monthlyNzd === 0 && g.annualReturnPct <= 0) return "Add a monthly amount, or the goal cannot grow.";
  return null;
}

export function goalProgress(g: GoalInput, now = new Date()) {
  const months = monthsUntil(g.targetDate, now);
  const projected = futureValue(g.bookNzd, g.monthlyNzd, months, g.annualReturnPct);
  const low = futureValue(g.bookNzd, g.monthlyNzd, months, g.annualReturnPct - 3);
  const high = futureValue(g.bookNzd, g.monthlyNzd, months, g.annualReturnPct + 3);
  const pct = Math.min(100, Math.round((g.bookNzd / g.targetNzd) * 100));
  return {
    months,
    projected,
    range: { low, high, label: "Illustrative, not a forecast" },
    status: projected >= g.targetNzd ? ("on track" as const) : ("behind" as const),
    progressPct: pct,
    summary: `${pct}% of the way to the goal. At this rate the book is illustrated at about NZ$${Math.round(projected).toLocaleString("en-NZ")} by ${g.targetDate}.`,
  };
}
