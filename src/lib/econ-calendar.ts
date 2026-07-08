/**
 * Deterministic economic-event calendar.
 *
 * These are *scheduled* macro catalysts — central-bank decisions, inflation and
 * employment prints, and earnings-season windows — whose dates are published in
 * advance by the respective authorities. No external API or key is required:
 * the fixed policy-meeting dates for 2026 are encoded, and the reliably-cadenced
 * releases (US Non-Farm Payrolls = first Friday; US CPI ≈ mid-month) are
 * computed relative to the query date so the "next 7 days" window is always
 * correctly dated.
 *
 * We only ever list that an event is scheduled — never a predicted outcome.
 * Pure module (safe on client and server); `getUpcomingEvents` takes an
 * optional reference date so it stays testable and resume-safe.
 */

import type { BotKind } from "@/lib/apex";

export type EconRegion = "NZ" | "AU" | "US" | "Global";
export type EconCategory =
  | "Central Bank"
  | "Inflation"
  | "Employment"
  | "Growth"
  | "Earnings";
export type EconImportance = "High" | "Medium";

export interface EconEvent {
  date: string; // ISO yyyy-mm-dd
  dateLabel: string; // "Wed 8 Jul"
  daysAway: number; // whole days from the reference date
  title: string;
  region: EconRegion;
  category: EconCategory;
  importance: EconImportance;
  /** Which bots this event is materially relevant to. */
  relevance: BotKind[];
  note: string;
}

/* --------------------------- Fixed 2026 schedule ------------------------- */
// Scheduled monetary-policy decisions as published by each central bank for
// 2026 (announcement dates). Equities react to all; crypto is most sensitive to
// the US Federal Reserve (global USD liquidity) and broad risk-macro prints.

interface SeedEvent {
  date: string;
  title: string;
  region: EconRegion;
  category: EconCategory;
  importance: EconImportance;
  relevance: BotKind[];
  note: string;
}

const FED: BotKind[] = ["stock", "crypto"];
const STOCK_ONLY: BotKind[] = ["stock"];

const FIXED_2026: SeedEvent[] = [
  // ---- US Federal Reserve (FOMC) — 8 scheduled meetings ----
  ...([
    "2026-01-28",
    "2026-03-18",
    "2026-04-29",
    "2026-06-17",
    "2026-07-29",
    "2026-09-16",
    "2026-10-28",
    "2026-12-09",
  ].map((d) => ({
    date: d,
    title: "US Federal Reserve (FOMC) rate decision",
    region: "US" as EconRegion,
    category: "Central Bank" as EconCategory,
    importance: "High" as EconImportance,
    relevance: FED,
    note: "Sets US policy rate — the primary driver of global risk appetite, USD liquidity and both equity and crypto flows.",
  }))),
  // ---- RBNZ Official Cash Rate reviews / Monetary Policy Statements ----
  ...([
    "2026-02-25",
    "2026-04-08",
    "2026-05-27",
    "2026-07-08",
    "2026-08-19",
    "2026-10-07",
    "2026-11-25",
  ].map((d) => ({
    date: d,
    title: "RBNZ Official Cash Rate decision",
    region: "NZ" as EconRegion,
    category: "Central Bank" as EconCategory,
    importance: "High" as EconImportance,
    relevance: STOCK_ONLY,
    note: "Reserve Bank of New Zealand OCR call — moves the NZD, NZX yield names (utilities, property) and bank margins.",
  }))),
  // ---- RBA (Reserve Bank of Australia) cash-rate decisions ----
  ...([
    "2026-02-03",
    "2026-03-17",
    "2026-05-05",
    "2026-06-16",
    "2026-08-11",
    "2026-09-29",
    "2026-11-03",
    "2026-12-08",
  ].map((d) => ({
    date: d,
    title: "RBA cash-rate decision",
    region: "AU" as EconRegion,
    category: "Central Bank" as EconCategory,
    importance: "High" as EconImportance,
    relevance: STOCK_ONLY,
    note: "Reserve Bank of Australia decision — drives the AUD, ASX banks and rate-sensitive sectors.",
  }))),
  // ---- NZ quarterly CPI (inflation) ----
  ...(["2026-01-21", "2026-04-16", "2026-07-16", "2026-10-20"].map((d) => ({
    date: d,
    title: "NZ CPI inflation (quarterly)",
    region: "NZ" as EconRegion,
    category: "Inflation" as EconCategory,
    importance: "High" as EconImportance,
    relevance: STOCK_ONLY,
    note: "Quarterly NZ inflation print — frames the RBNZ path and NZX rate-sensitive names.",
  }))),
  // ---- NZ quarterly employment / labour market ----
  ...(["2026-02-04", "2026-05-06", "2026-08-05", "2026-11-04"].map((d) => ({
    date: d,
    title: "NZ employment & unemployment rate",
    region: "NZ" as EconRegion,
    category: "Employment" as EconCategory,
    importance: "Medium" as EconImportance,
    relevance: STOCK_ONLY,
    note: "Quarterly NZ labour data — a key input to RBNZ policy and the domestic growth read.",
  }))),
  // ---- NZ quarterly GDP (growth) ----
  ...(["2026-03-19", "2026-06-18", "2026-09-17", "2026-12-17"].map((d) => ({
    date: d,
    title: "NZ GDP (quarterly)",
    region: "NZ" as EconRegion,
    category: "Growth" as EconCategory,
    importance: "Medium" as EconImportance,
    relevance: STOCK_ONLY,
    note: "Quarterly NZ growth print — sets the macro backdrop for the NZX.",
  }))),
];

/* ------------------- Reliably-cadenced monthly releases ------------------ */
// Computed relative to the query month so they always land on the right day.

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function iso(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function label(d: Date): string {
  return `${WEEKDAY_SHORT[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH_SHORT[d.getUTCMonth()]}`;
}

/** First Friday of a given month (US Non-Farm Payrolls convention). */
function firstFriday(year: number, month0: number): Date {
  const d = new Date(Date.UTC(year, month0, 1));
  const shift = (5 - d.getUTCDay() + 7) % 7; // 5 = Friday
  d.setUTCDate(1 + shift);
  return d;
}

/** Build the computed monthly US releases for the month containing `ref`
 *  and the following month, so a 7-day window that straddles a month-end
 *  still captures them. */
function monthlyUsEvents(ref: Date): SeedEvent[] {
  const out: SeedEvent[] = [];
  for (let k = 0; k <= 1; k++) {
    const y = ref.getUTCFullYear();
    const m0 = ref.getUTCMonth() + k;
    const year = y + Math.floor(m0 / 12);
    const month0 = ((m0 % 12) + 12) % 12;

    const nfp = firstFriday(year, month0);
    out.push({
      date: iso(nfp),
      title: "US Non-Farm Payrolls & unemployment",
      region: "US",
      category: "Employment",
      importance: "High",
      relevance: FED,
      note: "Monthly US jobs report — a top-tier catalyst for rate expectations, the USD and risk assets worldwide.",
    });

    // US CPI is released mid-month (~13th on a business day).
    const cpi = new Date(Date.UTC(year, month0, 13));
    const wd = cpi.getUTCDay();
    if (wd === 0) cpi.setUTCDate(14);
    else if (wd === 6) cpi.setUTCDate(12);
    out.push({
      date: iso(cpi),
      title: "US CPI inflation",
      region: "US",
      category: "Inflation",
      importance: "High",
      relevance: FED,
      note: "Monthly US inflation print — the single biggest swing factor for Fed rate-cut odds, bonds, equities and crypto.",
    });
  }
  return out;
}

/* ------------------------------ Query API ------------------------------- */

/**
 * All scheduled economic events relevant to `bot` within `days` of the
 * reference date (default: today), sorted soonest-first. `fromISO` lets callers
 * pin the reference date for deterministic output.
 */
export function getUpcomingEvents(bot: BotKind, fromISO?: string, days = 7): EconEvent[] {
  const ref = fromISO ? new Date(`${fromISO}T00:00:00Z`) : new Date();
  // Normalise the reference to midnight UTC for whole-day math.
  const start = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()));
  const startMs = start.getTime();
  const endMs = startMs + days * 86400000;

  const all: SeedEvent[] = [...FIXED_2026, ...monthlyUsEvents(start)];

  const seen = new Set<string>();
  const events: EconEvent[] = [];
  for (const e of all) {
    if (!e.relevance.includes(bot)) continue;
    const d = new Date(`${e.date}T00:00:00Z`);
    const t = d.getTime();
    if (t < startMs || t > endMs) continue;
    const dedupeKey = `${e.date}|${e.title}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    events.push({
      date: e.date,
      dateLabel: label(d),
      daysAway: Math.round((t - startMs) / 86400000),
      title: e.title,
      region: e.region,
      category: e.category,
      importance: e.importance,
      relevance: e.relevance,
      note: e.note,
    });
  }
  return events.sort((a, b) => a.daysAway - b.daysAway);
}
