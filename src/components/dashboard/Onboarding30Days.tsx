"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ONBOARDING_DONE_KEY,
  QUIZ_QUESTIONS,
  THIRTY_DAY_TASKS,
  pickPlan,
  recordFunnel,
  type QuizAnswers,
} from "@/lib/onboarding-30";

/** Goal b19 G-28: first-30-days checklist and plan-picker quiz. */
export function Onboarding30Days({ hasCash, hasHoldings }: { hasCash: boolean; hasHoldings: boolean }) {
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [answers, setAnswers] = useState<Partial<Record<string, string>>>({});
  useEffect(() => {
    try {
      setDone(JSON.parse(window.localStorage.getItem(ONBOARDING_DONE_KEY) || "{}"));
    } catch {
      /* ignore */
    }
    recordFunnel("view");
  }, []);
  function toggle(id: string) {
    const next = { ...done, [id]: !done[id] };
    setDone(next);
    try {
      window.localStorage.setItem(ONBOARDING_DONE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    if (next[id]) recordFunnel("task_done", id);
  }
  const isDone = (t: (typeof THIRTY_DAY_TASKS)[number]) =>
    t.auto === "cash" ? hasCash : t.auto === "holdings" ? hasHoldings : !!done[t.id];
  const count = THIRTY_DAY_TASKS.filter(isDone).length;
  const complete = QUIZ_QUESTIONS.every((q) => answers[q.id]);
  const result = complete
    ? pickPlan({
        holdings: answers.holdings as QuizAnswers["holdings"],
        exports: answers.exports === "yes",
        assistantHeavy: answers.assistantHeavy === "yes",
      })
    : null;
  useEffect(() => {
    if (result) recordFunnel("quiz_result", result.plan);
  }, [result?.plan]);

  return (
    <div className="space-y-8" data-onboarding-30>
      <section>
        <h2 className="text-lg font-semibold">Your first 30 days</h2>
        <p className="text-sm text-muted-foreground">
          {count} of {THIRTY_DAY_TASKS.length} done. Tick items off at your own pace; nothing here is required.
        </p>
        <ul className="mt-3 divide-y rounded-md border">
          {THIRTY_DAY_TASKS.map((t) => {
            const d = isDone(t);
            return (
              <li key={t.id} className="flex items-center gap-3 p-3 text-sm">
                <input
                  type="checkbox"
                  aria-label={t.title}
                  checked={d}
                  disabled={!!t.auto}
                  onChange={() => toggle(t.id)}
                  className="h-4 w-4"
                />
                <span className="w-16 shrink-0 text-xs font-semibold text-muted-foreground">{t.when}</span>
                <Link href={t.href} className={d ? "text-muted-foreground line-through" : "hover:underline"}>
                  {t.title}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
      <section>
        <h2 className="text-lg font-semibold">Which plan fits?</h2>
        <p className="text-sm text-muted-foreground">Three questions. This suggests a plan; it does not change your account.</p>
        <div className="mt-3 space-y-4">
          {QUIZ_QUESTIONS.map((q) => (
            <fieldset key={q.id}>
              <legend className="text-sm font-medium">{q.text}</legend>
              <div className="mt-1 flex flex-wrap gap-2">
                {q.options.map(([v, label]) => (
                  <label key={v} className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm">
                    <input
                      type="radio"
                      name={`quiz-${q.id}`}
                      value={v}
                      checked={answers[q.id] === v}
                      onChange={() => {
                        if (!Object.keys(answers).length) recordFunnel("quiz_start");
                        setAnswers((a) => ({ ...a, [q.id]: v }));
                      }}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
        {result ? (
          <p className="mt-4 rounded-md border bg-muted/40 p-3 text-sm" role="status" data-quiz-result>
            Suggested plan: <strong>{result.plan}</strong>. {result.why}{" "}
            <Link href="/pricing" className="text-primary hover:underline">Compare plans</Link>
          </p>
        ) : null}
      </section>
    </div>
  );
}
