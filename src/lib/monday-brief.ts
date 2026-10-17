/**
 * Goal b17 G-03: the "Monday Briefing" / "Explain my book" brief, in app only.
 *
 * Deterministic: every sentence is built from stored facts and carries the dated
 * source it came from. No AI provider is called (K-12 parked), nothing is emailed
 * (K-05 parked), and the whole feature sits behind IN_APP_BRIEFS=1.
 *
 * Audit rules, checked by `auditBrief`:
 * - every number in a sentence (outside dates and quoted headlines) is one of the
 *   sentence's declared figures, which come straight from the inputs;
 * - no buy / sell / hold / accumulate / trim wording;
 * - each brief cites at least 3 distinct dated sources.
 */
import { formatDisplayDate } from "@/lib/currency";
import { closeOnOrBefore, type StoredBenchmark } from "@/lib/benchmark-history";

export interface BriefSource {
  name: string;
  /** YYYY-MM-DD the cited figure or story is dated. */
  date: string;
  url?: string;
}

export interface BriefSentence {
  text: string;
  sources: BriefSource[];
  /** Figures (as printed) the sentence is allowed to contain. */
  figures: string[];
}

export interface BriefPosition {
  ticker: string;
  name: string;
  valueNzd: number | null;
  priceAsOf: string | null;
  priceSource: string | null;
}

export interface BriefNews {
  headline: string;
  source: string;
  publishedOn: string;
  url?: string;
}

export interface BriefInput {
  /** The Monday the brief is for (YYYY-MM-DD). */
  weekOf: string;
  netWorthNzd: number | null;
  bookAsOf: string;
  bookSource: string;
  positions: BriefPosition[];
  benchmarks: StoredBenchmark[];
  news: BriefNews[];
}

export interface MondayBrief {
  weekOf: string;
  title: string;
  sentences: BriefSentence[];
  sources: BriefSource[];
}

const ADVICE = /\b(buy|buys|buying|sell|sells|selling|hold|holding off|accumulate|trim|should|recommend)\b/i;
const DATE_TEXT = /\b\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}\b/g;

const nzd = (n: number) => `NZ$${n.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signedPct = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n * 100).toFixed(2)}%`;
/** A YYYY-MM-DD day from an ISO time or a readable date; "" when it cannot be read. */
export function toDay(value: string | null | undefined): string {
  const v = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const m = /^(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* (\d{4})/.exec(v);
  if (!m) return "";
  const month = "JanFebMarAprMayJunJulAugSepOctNovDec".indexOf(m[2]) / 3 + 1;
  return `${m[3]}-${String(month).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}
const day = (iso: string) => toDay(iso);

function shiftDays(iso: string, days: number): string {
  const t = Date.parse(`${day(iso)}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export function buildMondayBrief(input: BriefInput): MondayBrief {
  const sentences: BriefSentence[] = [];
  const bookDay = day(input.bookAsOf);
  const bookSrc: BriefSource = { name: input.bookSource || "Your portfolio snapshot", date: bookDay };

  if (input.netWorthNzd != null) {
    const v = nzd(input.netWorthNzd);
    sentences.push({ text: `Your book was worth ${v} on ${formatDisplayDate(bookDay)}.`, sources: [bookSrc], figures: [v] });
  } else {
    sentences.push({ text: `Your book's value is not available for ${formatDisplayDate(bookDay)}, so it is shown as —.`, sources: [bookSrc], figures: [] });
  }

  const valued = input.positions.filter((p) => p.valueNzd != null && p.valueNzd > 0);
  const total = valued.reduce((s, p) => s + (p.valueNzd as number), 0);
  const top = [...valued].sort((a, b) => (b.valueNzd as number) - (a.valueNzd as number))[0];
  if (top && total > 0) {
    const w = `${(((top.valueNzd as number) / total) * 100).toFixed(1)}%`;
    const v = nzd(top.valueNzd as number);
    const src: BriefSource = { name: top.priceSource || "Stored price", date: day(top.priceAsOf || "") || day(input.bookAsOf) };
    sentences.push({
      text: `Your largest position is ${top.ticker} (${top.name}) at ${v}, ${w} of the valued holdings, priced on ${formatDisplayDate(src.date)}.`,
      sources: [src],
      figures: [v, w],
    });
  }
  if (valued.length) {
    const n = String(valued.length);
    sentences.push({ text: `${n} position${valued.length === 1 ? " has" : "s have"} a stored price this week.`, sources: [bookSrc], figures: [n] });
  }

  const weekStart = shiftDays(input.weekOf, -7);
  for (const b of input.benchmarks) {
    const end = closeOnOrBefore(b.prices, shiftDays(input.weekOf, -1));
    const start = closeOnOrBefore(b.prices, weekStart);
    const src: BriefSource = { name: `${b.name} · ${b.source.split(";")[0]}`, date: end?.date || b.asOf };
    if (!end || !start || end.date === start.date) {
      sentences.push({ text: `${b.name}: no stored close for the week to ${formatDisplayDate(input.weekOf)}, so the change is —.`, sources: [src], figures: [b.name] });
      continue;
    }
    const chg = signedPct(end.level / start.level - 1);
    sentences.push({
      text: `${b.name} moved ${chg} between the ${formatDisplayDate(start.date)} and ${formatDisplayDate(end.date)} closes.`,
      sources: [{ ...src, date: end.date }],
      figures: [chg, b.name],
    });
  }

  const clean = input.news.filter((n) => n.headline && !ADVICE.test(n.headline) && n.publishedOn).slice(0, 2);
  for (const n of clean) {
    sentences.push({
      text: `In the news: “${n.headline}” (${n.source}, ${formatDisplayDate(n.publishedOn)}).`,
      sources: [{ name: n.source, date: day(n.publishedOn), url: n.url }],
      figures: [],
    });
  }

  sentences.push({
    text: "This brief explains what changed in your book and the markets. It is general information, not financial advice.",
    sources: [],
    figures: [],
  });

  const seen = new Map<string, BriefSource>();
  for (const s of sentences) for (const src of s.sources) seen.set(`${src.name}|${src.date}`, src);
  return { weekOf: input.weekOf, title: `Monday Briefing · ${formatDisplayDate(input.weekOf)}`, sentences, sources: [...seen.values()] };
}

/** Numbers printed in a sentence outside dates and quoted headlines. */
export function printedNumbers(text: string): string[] {
  const stripped = text.replace(/“[^”]*”/g, "").replace(DATE_TEXT, "");
  return stripped.match(/[+−-]?(NZ\$)?\d[\d,]*(\.\d+)?%?/g) ?? [];
}

export interface BriefAudit {
  sentences: number;
  unsupported: string[];
  advice: string[];
  datedSources: number;
}

export function auditBrief(brief: MondayBrief): BriefAudit {
  const unsupported: string[] = [];
  const advice: string[] = [];
  for (const s of brief.sentences) {
    for (const n of printedNumbers(s.text)) {
      if (!s.figures.some((f) => f.includes(n.replace(/^[+−-]/, "")) || n.includes(f))) unsupported.push(`${n} in "${s.text}"`);
    }
    const body = s.text.replace(/“[^”]*”/g, "");
    if (ADVICE.test(body)) advice.push(s.text);
  }
  return { sentences: brief.sentences.length, unsupported, advice, datedSources: brief.sources.filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.date)).length };
}

/** Opt-out is stored on the device; an opted-out member gets no brief built or shown. */
export const BRIEF_OPT_OUT_KEY = "aetherforge-brief-opt-out";
export function briefsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.IN_APP_BRIEFS === "1";
}
