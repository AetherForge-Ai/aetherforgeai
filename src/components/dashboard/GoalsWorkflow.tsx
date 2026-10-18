"use client";

import { useCallback, useEffect, useState } from "react";
import { goalProgress, monthlyNeeded, validateGoal } from "@/lib/goal-math";
import { formatGoalDate, goalMissingField, normalizeGoalRow } from "@/lib/goal-record";
import { Button } from "@/components/ui/button";

type GoalRow = {
  _id: string;
  label?: string;
  target_nzd: number;
  target_date: string;
  monthly_nzd: number;
  annual_return_pct: number;
  start_nzd?: number | null;
};

type Draft = { id: string | null; label: string; target: string; date: string; monthly: string; start: string; ret: string };
const EMPTY: Draft = { id: null, label: "", target: "", date: "", monthly: "", start: "", ret: "5" };

const nzd = (n: number) => `NZ$${Math.round(n).toLocaleString("en-NZ")}`;
const num = (v: string) => (v.trim() === "" ? NaN : Number(v.replace(/[, ]/g, "")));

export default function GoalsWorkflow() {
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [announce, setAnnounce] = useState("");

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const res = await fetch("/api/goals", { credentials: "include", cache: "no-store", signal: AbortSignal.timeout(5000) });
      const body = (await res.json()) as { ok?: boolean; data?: GoalRow[]; error?: string };
      if (!body.ok) throw new Error(body.error || "Goals did not load.");
      setGoals((body.data || []).map((r) => normalizeGoalRow(r as unknown as Record<string, unknown>)));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Goals did not load.");
    } finally {
      setLoaded(true);
    }
  }, []);
  useEffect(() => void load(), [load]);

  const input = {
    targetNzd: num(draft.target),
    targetDate: draft.date,
    monthlyNzd: draft.monthly.trim() === "" ? 0 : num(draft.monthly),
    bookNzd: num(draft.start || "0"),
    annualReturnPct: num(draft.ret || "0"),
  };
  const preview = !validateGoal(input) ? goalProgress(input) : null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const problem = !Number.isFinite(input.targetNzd) ? "Enter a target above NZ$0." : validateGoal(input);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError("");
    const payload = {
      ...(draft.id ? { id: draft.id } : {}),
      label: draft.label.trim() || "Goal",
      target_nzd: input.targetNzd,
      target_date: input.targetDate,
      monthly_nzd: input.monthlyNzd,
      annual_return_pct: input.annualReturnPct,
      start_nzd: input.bookNzd,
    };
    try {
      const res = await fetch("/api/goals", {
        method: draft.id ? "PATCH" : "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string; data?: GoalRow; startSaved?: boolean };
      if (!body.ok) {
        setError(body.error || "The goal was not saved.");
        return;
      }
      const saved: GoalRow = normalizeGoalRow({ ...(body.data as GoalRow), ...payload, _id: body.data?._id || draft.id || "", start_nzd: input.bookNzd } as unknown as Record<string, unknown>);
      setGoals((prev) => [saved, ...prev.filter((g) => g._id !== saved._id)]);
      setAnnounce(`${saved.label} saved. ${goalProgress({ ...input }).summary}${body.startSaved === false ? " The starting amount could not be stored yet." : ""}`);
      setDraft(EMPTY);
      // b27 H-11: re-read from the server so the list shows what a reload will show.
      window.setTimeout(() => void load(), 1200);
    } catch {
      setError("The goal was not saved. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(g: GoalRow) {
    if (busy) return;
    setBusy(true);
    const before = goals;
    setGoals((prev) => prev.filter((x) => x._id !== g._id));
    try {
      const res = await fetch(`/api/goals?id=${encodeURIComponent(g._id)}`, { method: "DELETE", credentials: "include" });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!body.ok) throw new Error(body.error || "The goal was not removed.");
      setAnnounce(`${g.label || "Goal"} removed.`);
    } catch (err) {
      setGoals(before);
      setError(err instanceof Error ? err.message : "The goal was not removed.");
    } finally {
      setBusy(false);
    }
  }

  const field = (key: keyof Draft, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="grid gap-1 text-sm">
      <span>{label}</span>
      <input
        className="min-h-11 rounded-md border bg-background px-3"
        value={draft[key] ?? ""}
        onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
        {...props}
      />
    </label>
  );

  return (
    <div className="mt-6 space-y-6" data-goals>
      <p className="sr-only" aria-live="polite" data-goal-announce>{announce}</p>
      <form onSubmit={save} className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2" noValidate>
        <h2 className="font-semibold sm:col-span-2">{draft.id ? "Edit goal" : "New goal"}</h2>
        {field("label", "Name", { maxLength: 80, placeholder: "House deposit" })}
        {field("target", "Target (NZ$)", { inputMode: "decimal", required: true })}
        {field("date", "Target date", { type: "date", required: true })}
        {field("start", "Starting amount (NZ$)", { inputMode: "decimal" })}
        {field("monthly", "Monthly amount (NZ$)", { inputMode: "decimal" })}
        {field("ret", "Assumed yearly return (%)", { inputMode: "decimal" })}
        {error ? <p className="text-sm text-rose-600 sm:col-span-2" role="alert" data-goal-error>{error}</p> : null}
        <div aria-live="polite" className="text-sm sm:col-span-2" data-goal-preview>
          {preview ? (
            <>
              Projected {nzd(preview.projected)} by {draft.date} ({preview.months} months, {preview.status}). Range {nzd(preview.range.low)} to {nzd(preview.range.high)} at ±3% a year. {preview.range.label}.
            </>
          ) : null}
        </div>
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : draft.id ? "Save changes" : "Add goal"}</Button>
          {draft.id ? <Button type="button" variant="ghost" onClick={() => { setDraft(EMPTY); setError(""); }}>Cancel</Button> : null}
        </div>
      </form>

      {!loaded ? <p className="text-sm text-muted-foreground">Loading your goals…</p> : null}
      {loadError ? (
        <p className="text-sm" role="alert">{loadError} <button type="button" className="underline" onClick={() => void load()}>Try again</button></p>
      ) : null}
      {loaded && !loadError && goals.length === 0 ? <p className="text-sm text-muted-foreground">No goals yet.</p> : null}
      <ul className="grid gap-3">
        {goals.map((g) => {
          const rec = normalizeGoalRow(g as unknown as Record<string, unknown>);
          const missing = goalMissingField(rec);
          const gi = { targetNzd: rec.target_nzd, targetDate: rec.target_date, monthlyNzd: rec.monthly_nzd, bookNzd: rec.start_nzd ?? 0, annualReturnPct: rec.annual_return_pct };
          const problem = missing ? null : validateGoal(gi);
          const pastDate = !!problem && problem.startsWith("Choose a date");
          const raw = missing || pastDate ? null : goalProgress(gi);
          // b28 H-11: never print NaN; a goal that cannot be projected says which field is missing.
          const p = raw && Number.isFinite(raw.projected) && Number.isFinite(raw.range.low) && Number.isFinite(raw.range.high) ? raw : null;
          return (
            <li key={g._id} className="rounded-xl border p-4 text-sm" data-goal-row>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold">{g.label || "Goal"}</h3>
                <span>{nzd(gi.targetNzd)} by {formatGoalDate(rec.target_date)}</span>
              </div>
              {p ? (
                <>
                  <div className="mt-2 h-2 rounded bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p.progressPct} aria-label={`${g.label || "Goal"} progress`}>
                    <div className="h-2 rounded bg-primary" style={{ width: `${p.progressPct}%` }} />
                  </div>
                  <p className="mt-2" aria-live="polite">
                    {p.progressPct}% there. Projected {nzd(p.projected)} ({p.status}); range {nzd(p.range.low)} to {nzd(p.range.high)}. {p.range.label}.
                  </p>
                  {(() => {
                    const need = monthlyNeeded(gi);
                    return Number.isFinite(need) ? (
                      <p className="mt-1 text-muted-foreground" data-monthly-needed>
                        Monthly amount needed to reach it by {formatGoalDate(rec.target_date)}: {nzd(need)} at {gi.annualReturnPct}% a year (illustrative, not a forecast or advice).
                      </p>
                    ) : null;
                  })()}
                </>
              ) : pastDate ? (
                <p className="mt-2 text-amber-700" role="status">This goal&apos;s date has passed. Edit the date to keep tracking it.</p>
              ) : (
                <p className="mt-2 text-amber-700" role="status" data-goal-cant-project>Can&apos;t project: {missing || "a figure"} missing. Use Edit to add it.</p>
              )}
              <div className="mt-3 flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setDraft({ id: rec._id, label: rec.label, target: Number.isFinite(rec.target_nzd) ? String(rec.target_nzd) : "", date: rec.target_date, monthly: String(rec.monthly_nzd), start: rec.start_nzd == null ? "" : String(rec.start_nzd), ret: String(rec.annual_return_pct) })}>Edit</Button>
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void remove(g)}>Delete</Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
