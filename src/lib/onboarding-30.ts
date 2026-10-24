/**
 * Goal b19 G-28: first-30-days checklist and plan-picker quiz. Plain wording:
 * no streaks, prizes, "win", "jackpot" or other gambling-style language.
 * The funnel is counted in this browser only (localStorage), and also pushed to
 * the consent-gated Google tag when analytics were accepted.
 */
import { CONSENT_STORAGE_KEY } from "@/lib/analytics-consent";

export const ONBOARDING_FUNNEL_KEY = "af-onboarding-funnel-v1";
export const ONBOARDING_DONE_KEY = "af-onboarding-30-done-v1";

export interface ThirtyDayTask {
  id: string;
  when: string;
  title: string;
  href: string;
  auto?: "cash" | "holdings";
}

export const THIRTY_DAY_TASKS: readonly ThirtyDayTask[] = [
  { id: "cash", when: "Day 1", title: "Record your starting cash", href: "/dashboard", auto: "cash" },
  { id: "holding", when: "Day 1", title: "Add your first holding", href: "/dashboard", auto: "holdings" },
  { id: "import", when: "Week 1", title: "Import the rest from a broker CSV", href: "/import" },
  { id: "alert", when: "Week 1", title: "Set a price alert on one holding", href: "/dashboard/alerts" },
  { id: "report", when: "Week 2", title: "Read one research report on a holding", href: "/dashboard" },
  { id: "dividend", when: "Week 3", title: "Record a dividend when one is paid", href: "/tax/dividends" },
  { id: "tax", when: "Day 30", title: "Check the FIF and income pages for the tax year", href: "/tax" },
  { id: "review", when: "Day 30", title: "Compare your return with the NZX 50 on Performance", href: "/dashboard/performance" },
];

export const GAMBLING_WORDS = /\b(win|winning|jackpot|streak|bet|odds|prize|lucky|cash out|level up)\b/i;

export type QuizAnswers = { holdings: "10" | "25" | "75" | "more"; exports: boolean; assistantHeavy: boolean };

export const QUIZ_QUESTIONS = [
  { id: "holdings", text: "How many holdings will you track?", options: [["10", "Up to 10"], ["25", "11 to 25"], ["75", "26 to 75"], ["more", "More than 75"]] },
  { id: "exports", text: "Do you need CSV exports or the tax pack for your accountant?", options: [["yes", "Yes"], ["no", "No"]] },
  { id: "assistantHeavy", text: "Will you ask the Market Assistant many questions every day?", options: [["yes", "Yes"], ["no", "No"]] },
] as const;

/** The smallest plan that covers the answers. Plan names only; prices live on /pricing. */
export function pickPlan(a: QuizAnswers): { plan: "Free" | "Starter" | "Pro" | "Ultimate"; why: string } {
  if (a.holdings === "more" || a.assistantHeavy) {
    return { plan: "Ultimate", why: a.holdings === "more" ? "It has no holdings cap." : "It has no Market Assistant limit." };
  }
  if (a.holdings === "75") return { plan: "Pro", why: "It covers up to 75 holdings." };
  if (a.holdings === "25") return { plan: "Starter", why: "It covers up to 25 holdings and includes CSV export." };
  if (a.exports) return { plan: "Starter", why: "CSV export and the tax pack start on Starter." };
  return { plan: "Free", why: "Up to 10 holdings, with no card needed." };
}

export type FunnelStep = "view" | "task_done" | "quiz_start" | "quiz_result";

export function recordFunnel(step: FunnelStep, detail?: string): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(ONBOARDING_FUNNEL_KEY);
    const data = (raw ? JSON.parse(raw) : {}) as Record<string, number>;
    data[step] = (data[step] ?? 0) + 1;
    window.localStorage.setItem(ONBOARDING_FUNNEL_KEY, JSON.stringify(data));
  } catch {
    /* storage blocked: nothing recorded */
  }
  const g = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
  if (typeof g === "function") g("event", `onboarding_${step}`, detail ? { detail } : {});
  sendFunnelToServer(step, detail);
}

/** b66 G-28: anonymous funnel id cookie (first-party, 180 days), set only after analytics consent. */
export const FUNNEL_ANON_COOKIE = "af_funnel_anon";
const ANON_MAX_AGE_S = 180 * 24 * 60 * 60;

function analyticsGranted(): boolean {
  try {
    return window.localStorage.getItem(CONSENT_STORAGE_KEY) === "granted";
  } catch {
    return false;
  }
}

/** Consent granted: keep (or make) the anon id. Declined or unset: delete it. */
export function syncFunnelAnonCookie(granted: boolean): void {
  if (typeof document === "undefined") return;
  const has = document.cookie.split(/;\s*/).some((c) => c.startsWith(`${FUNNEL_ANON_COOKIE}=`));
  if (!granted) {
    if (has) document.cookie = `${FUNNEL_ANON_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax; Secure`;
    return;
  }
  if (has) return;
  const b = new Uint8Array(18);
  crypto.getRandomValues(b);
  const id = btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  document.cookie = `${FUNNEL_ANON_COOKIE}=${id}; Path=/; Max-Age=${ANON_MAX_AGE_S}; SameSite=Lax; Secure`;
}

/** b66 G-28: the client step name → the server's write-only event (validated again on the server). */
export function serverFunnelEvent(step: FunnelStep, detail?: string): { event: string; stepKey?: string; planResult?: string } {
  const key = (detail || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40) || undefined;
  if (step === "task_done") return { event: "checklist_step", stepKey: key };
  if (step === "quiz_result") return { event: "quiz_result", planResult: key };
  return { event: step };
}

function sendFunnelToServer(step: FunnelStep, detail?: string): void {
  const consent = analyticsGranted();
  syncFunnelAnonCookie(consent);
  try {
    void fetch("/api/onboarding/funnel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...serverFunnelEvent(step, detail), consent }),
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => undefined);
  } catch {
    /* offline: the local count above still has it */
  }
}
