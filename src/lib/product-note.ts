/**
 * Weekday product notes for registered users.
 *
 * Cadence is Pacific/Auckland, weekdays only:
 *   Monday    10:15  week-open note
 *   Wednesday 10:15  midweek note
 *   Friday    17:15  week-close note, after the 16:45 cash close
 *
 * The NZX opening auction prints at a random time within 30 seconds of 10:00.
 * A 9:00 send is still pre-open and is not a slot.
 *
 * This repo does not ship an NZ public-holiday calendar, so only Saturday and
 * Sunday are skipped. A weekday that is a public holiday still matches.
 *
 * Sending is off unless PRODUCT_NOTE_SEND is exactly "on". Nothing in this
 * file contacts a mailbox.
 */

export const PRODUCT_NOTE_FROM = "admin@aetherforgeai.co.nz";
export const PRODUCT_NOTE_DISCLAIMER =
  "Illustrative information, not financial advice. You execute on your own broker.";

/** False: no NZ public-holiday list lives in this repo. */
export const NZ_PUBLIC_HOLIDAYS_IN_REPO = false;

export const NZSX_OPEN_MINUTE = 10 * 60;
export const NZSX_CLOSE_MINUTE = 16 * 60 + 45;
const SEND_WINDOW_MINUTES = 15;
const MON_WED_SEND = 10 * 60 + 15;
const FRIDAY_SEND = 17 * 60 + 15;
const COVERAGE = 0.8;
const MOVER_LIMIT = 10;

export type ProductNoteKind = "monday" | "wednesday" | "friday";
export type NoteMarket = "NZSX" | "ASX" | "Nasdaq" | "Dow Jones" | "Crypto";

export interface AucklandClock {
  year: number;
  month: number;
  day: number;
  weekday: "Sun" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat";
  hour: number;
  minute: number;
}

export interface IndexBar {
  date: string;
  minutes: number;
  open: number | null;
  close: number | null;
}

export interface PricePoint {
  date: string;
  close: number;
}

export interface SymbolSeries {
  ticker: string;
  name: string;
  points: PricePoint[];
}

export interface MarketFacts {
  market: NoteMarket;
  requested: number;
  series: SymbolSeries[];
}

export interface RawHeadline {
  headline: string;
  url: string;
  publishedAt: string;
}

export interface VerifiedFacts {
  indexFetched: boolean;
  indexBars: IndexBar[];
  markets: MarketFacts[];
  headlines: RawHeadline[];
  /** Current OCR from the RBNZ page, or null when it could not be verified. */
  verifiedOcr: number | null;
  scenarioText: string | null;
  boardUrl: string;
}

export interface MoverRow {
  ticker: string;
  name: string;
  pct: number;
  from: string;
  to: string;
}

export interface MoverBoard {
  market: NoteMarket;
  windowLabel: "Last week" | "Last 30 days";
  rows: MoverRow[];
}

export interface NewsLine {
  date: string;
  source: string;
  headline: string;
  url: string;
}

export interface NzsxPrint {
  status: "print" | "not-in" | "unavailable";
  printKind: "open" | "close";
  level: number | null;
  changePct: number | null;
  asOf: string | null;
  boardUrl: string;
}

export interface ProductNoteContent {
  kind: ProductNoteKind;
  generatedOn: string;
  nzsx: NzsxPrint;
  overview: string | null;
  changedSinceLast: string | null;
  weekSummary: string | null;
  boards: MoverBoard[];
  news: NewsLine[];
  weekendNote: string | null;
  scenario: string | null;
}

export interface RenderedProductNote {
  subject: string;
  text: string;
  html: string;
}

export interface OutboundProductNote extends RenderedProductNote {
  to: string;
  from: typeof PRODUCT_NOTE_FROM;
  fromName: "AetherForge AI";
  replyTo: typeof PRODUCT_NOTE_FROM;
}

export interface ProductNoteJobResult {
  status: number;
  body: {
    ok: boolean;
    sent: number;
    sender: "off" | "on";
    reason: string;
    kind?: ProductNoteKind | null;
  };
}

const SUBJECT: Record<ProductNoteKind, string> = {
  monday: "AetherForge AI week-open note",
  wednesday: "AetherForge AI midweek note",
  friday: "AetherForge AI week-close note",
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function aucklandClock(now: Date): AucklandClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Pacific/Auckland",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0;
  const weekday = get("weekday");
  const known = WEEKDAYS.find((d) => d === weekday) ?? "Sun";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: known,
    hour,
    minute: Number(get("minute")),
  };
}

export function aucklandYmd(now: Date): string {
  const c = aucklandClock(now);
  return `${c.year}-${String(c.month).padStart(2, "0")}-${String(c.day).padStart(2, "0")}`;
}

export function aucklandMinutes(now: Date): number {
  const c = aucklandClock(now);
  return c.hour * 60 + c.minute;
}

/**
 * Which note is due at this instant, or null.
 * The window is the scheduled minute plus 14 minutes so one scheduler tick can land.
 * No scheduler is installed by this module.
 */
export function productNoteKindAt(now: Date): ProductNoteKind | null {
  const clock = aucklandClock(now);
  if (clock.weekday === "Sat" || clock.weekday === "Sun") return null;
  const mins = clock.hour * 60 + clock.minute;
  const inWindow = (start: number) => mins >= start && mins < start + SEND_WINDOW_MINUTES;
  if (clock.weekday === "Mon" && inWindow(MON_WED_SEND)) return "monday";
  if (clock.weekday === "Wed" && inWindow(MON_WED_SEND)) return "wednesday";
  if (clock.weekday === "Fri" && inWindow(FRIDAY_SEND)) return "friday";
  return null;
}

/** The only value that arms a real send. Unset, "true", "1", and "yes" stay off. */
export function productNoteSendingEnabled(env?: { PRODUCT_NOTE_SEND?: string }): boolean {
  const source = env ?? process.env;
  return source.PRODUCT_NOTE_SEND === "on";
}

export function nzsxBoardUrl(appUrl?: string): string {
  const fallback = "https://www.aetherforgeai.co.nz";
  try {
    const u = new URL((appUrl || fallback).trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return `${fallback}/dashboard/markets/nzsx`;
    return `${u.origin}/dashboard/markets/nzsx`;
  } catch {
    return `${fallback}/dashboard/markets/nzsx`;
  }
}

export function registeredEmail(row: { email?: unknown }): string | null {
  if (typeof row.email !== "string") return null;
  const trimmed = row.email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
}

export function dedupeRecipients(rows: { email?: unknown }[]): { email: string }[] {
  const seen = new Set<string>();
  const out: { email: string }[] = [];
  for (const row of rows) {
    const email = registeredEmail(row);
    if (!email) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ email });
  }
  return out;
}

export function formatLevel(n: number): string {
  return n.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatPct(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded.toFixed(1)}%`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatNoteDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d || m < 1 || m > 12) return ymd;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

export function addDays(ymd: string, days: number): string {
  const dt = parseYmd(ymd);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function daysBetween(earlier: string, later: string): number {
  return Math.round((parseYmd(later).getTime() - parseYmd(earlier).getTime()) / 86_400_000);
}

export function sessionLevels(bars: IndexBar[], date: string): { open: number | null; close: number | null } {
  const day = bars.filter((b) => b.date === date);
  const opens = day
    .filter((b) => b.minutes >= NZSX_OPEN_MINUTE && b.open != null && b.open > 0)
    .sort((a, b) => a.minutes - b.minutes);
  const closes = day
    .filter((b) => b.minutes >= NZSX_CLOSE_MINUTE && b.close != null && b.close > 0)
    .sort((a, b) => a.minutes - b.minutes);
  return {
    open: opens[0]?.open ?? null,
    close: closes[closes.length - 1]?.close ?? null,
  };
}

function previousClose(bars: IndexBar[], beforeDate: string): { date: string; level: number } | null {
  const dates = [...new Set(bars.map((b) => b.date))]
    .filter((d) => d < beforeDate)
    .sort();
  for (let i = dates.length - 1; i >= 0; i--) {
    const level = sessionLevels(bars, dates[i]).close;
    if (level != null) return { date: dates[i], level };
  }
  return null;
}

function levelOn(bars: IndexBar[], date: string, field: "open" | "close"): number | null {
  const session = sessionLevels(bars, date);
  return field === "open" ? session.open : session.close;
}

export function parseOfficialCashRate(html: string): number | null {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
  const patterns = [
    /current official cash rate(?:\s*\(OCR\))?\s+is\s+(\d{1,2}(?:\.\d{1,2})?)\s*(?:per\s*cent|%)/gi,
    /the official cash rate(?:\s*\(OCR\))?\s+is\s+(\d{1,2}(?:\.\d{1,2})?)\s*(?:per\s*cent|%)/gi,
    /\bOCR\s+is\s+(\d{1,2}(?:\.\d{1,2})?)\s*(?:per\s*cent|%)/gi,
  ];
  const found = new Set<number>();
  for (const re of patterns) {
    for (const match of text.matchAll(re)) {
      const n = Number(match[1]);
      if (Number.isFinite(n)) found.add(Math.round(n * 100) / 100);
    }
  }
  if (found.size !== 1) return null;
  return [...found][0];
}

const SOURCE_BY_HOST: { suffix: string; label: string }[] = [
  { suffix: "rnz.co.nz", label: "RNZ" },
  { suffix: "businessdesk.co.nz", label: "BusinessDesk" },
  { suffix: "bbc.co.uk", label: "BBC" },
  { suffix: "bbc.com", label: "BBC" },
  { suffix: "coindesk.com", label: "CoinDesk" },
  { suffix: "cointelegraph.com", label: "Cointelegraph" },
  { suffix: "rbnz.govt.nz", label: "RBNZ" },
  { suffix: "nzx.com", label: "NZX" },
  { suffix: "finance.yahoo.com", label: "Yahoo Finance" },
];

export function sourceLabelForUrl(url: string): string | null {
  let host = "";
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    host = u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  if (!host || host.includes(" ")) return null;
  for (const row of SOURCE_BY_HOST) {
    if (host === row.suffix || host.endsWith(`.${row.suffix}`)) return row.label;
  }
  return host;
}

function mentionsOcr(text: string): boolean {
  return /\bOCR\b|official cash rate/i.test(text);
}

function ratesIn(text: string): number[] {
  const out: number[] = [];
  for (const match of text.matchAll(/(\d{1,2}(?:\.\d{1,2})?)\s*(?:%|per\s*cent)/gi)) {
    const n = Number(match[1]);
    if (Number.isFinite(n)) out.push(Math.round(n * 100) / 100);
  }
  return out;
}

export function acceptHeadline(
  raw: RawHeadline,
  today: string,
  verifiedOcr: number | null
): NewsLine | null {
  const headline = raw.headline.replace(/\s+/g, " ").trim();
  if (headline.length < 12 || headline.length > 240) return null;
  const source = sourceLabelForUrl(raw.url);
  if (!source) return null;
  const published = new Date(raw.publishedAt);
  if (Number.isNaN(published.getTime())) return null;
  const date = aucklandYmd(published);
  if (date > today || daysBetween(date, today) > 8) return null;
  if (mentionsOcr(headline)) {
    if (verifiedOcr == null) return null;
    const rates = ratesIn(headline);
    if (!rates.length || rates.some((r) => Math.abs(r - verifiedOcr) > 0.001)) return null;
  }
  return { date: formatNoteDate(date), source, headline, url: raw.url.trim() };
}

const BANNED_SCENARIO =
  /\b(grok|supergrok|xai|claude|gemini|gpt-\d)\b|grok-[\d.]+|\b(buy|sell|hold)\b|\brecommend|\b100\s*%|hard sell|\bguarantee|\byou should\b|\bforecast\b|\bwill (rise|fall|rally|drop|go)\b/i;

/** Keep a short illustrative scenario, or drop the text when it is not safe to show. */
export function acceptAiScenario(raw: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || BANNED_SCENARIO.test(cleaned)) return null;
  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter((s) => !/financial advice/i.test(s)).slice(0, 2);
  const joined = sentences.join(" ").trim();
  if (!joined || joined.length > 420 || BANNED_SCENARIO.test(joined)) return null;
  return joined;
}

function latestOnOrBefore(points: PricePoint[], ymd: string): PricePoint | null {
  let best: PricePoint | null = null;
  for (const p of points) {
    if (!(p.close > 0) || p.date > ymd) continue;
    if (!best || p.date > best.date) best = p;
  }
  return best;
}

export function changeOver(points: PricePoint[], days: number, today: string): { pct: number; from: string; to: string } | null {
  const end = latestOnOrBefore(points, today);
  if (!end) return null;
  const target = addDays(end.date, -days);
  const start = latestOnOrBefore(
    points.filter((p) => p.date < end.date),
    target
  );
  if (!start) return null;
  if (Math.abs(daysBetween(start.date, target)) > 4) return null;
  const pct = ((end.close - start.close) / start.close) * 100;
  if (!Number.isFinite(pct)) return null;
  return { pct, from: start.date, to: end.date };
}

function boardsFor(markets: MarketFacts[], today: string, windows: { days: number; label: MoverBoard["windowLabel"] }[]): MoverBoard[] {
  const boards: MoverBoard[] = [];
  for (const window of windows) {
    for (const market of markets) {
      if (market.requested <= 0) continue;
      const ranked: MoverRow[] = [];
      let usable = 0;
      for (const series of market.series) {
        const move = changeOver(series.points, window.days, today);
        if (!move) continue;
        usable += 1;
        const shown = Math.round(move.pct * 10) / 10;
        if (shown <= 0) continue;
        ranked.push({
          ticker: series.ticker,
          name: series.name,
          pct: shown,
          from: move.from,
          to: move.to,
        });
      }
      if (usable / market.requested < COVERAGE) continue;
      ranked.sort((a, b) => b.pct - a.pct || a.ticker.localeCompare(b.ticker));
      boards.push({ market: market.market, windowLabel: window.label, rows: ranked.slice(0, MOVER_LIMIT) });
    }
  }
  return boards;
}

function dateOfWeekday(today: string, todayWeekday: AucklandClock["weekday"], want: AucklandClock["weekday"]): string {
  return addDays(today, WEEKDAYS.indexOf(want) - WEEKDAYS.indexOf(todayWeekday));
}

function moveSentence(fromLabel: string, fromLevel: number, fromDate: string, toLevel: number, toDate: string): string {
  return `Since ${fromLabel}, the S&P/NZX 50 has moved from ${formatLevel(fromLevel)} on ${formatNoteDate(fromDate)} to ${formatLevel(toLevel)} on ${formatNoteDate(toDate)}.`;
}

function weekSentence(start: number, startDate: string, end: number, endDate: string): string {
  const pct = ((end - start) / start) * 100;
  return `This week the S&P/NZX 50 moved from ${formatLevel(start)} on ${formatNoteDate(startDate)} to ${formatLevel(end)} on ${formatNoteDate(endDate)}. That is a change of ${formatPct(pct)}.`;
}

function weekendNote(news: NewsLine[]): string | null {
  const hit = news.find((n) => {
    const blob = n.headline.toLowerCase();
    const weekend = /\b(weekend|saturday|sunday)\b/.test(blob);
    const global = /\b(fed|federal reserve|oil|china|nasdaq|dow|wall street|s&p|europe|global markets|us market)\b/.test(blob);
    return weekend && global;
  });
  if (!hit) return null;
  return `One global item to be aware of over the weekend: ${hit.headline} (${hit.source}, ${hit.date}). This is not a suggestion to act.`;
}

export function assembleProductNote(kind: ProductNoteKind, now: Date, facts: VerifiedFacts): ProductNoteContent {
  const today = aucklandYmd(now);
  const mins = aucklandMinutes(now);
  const printKind: "open" | "close" = kind === "friday" ? "close" : "open";
  let nzsx: NzsxPrint = {
    status: facts.indexFetched ? "not-in" : "unavailable",
    printKind,
    level: null,
    changePct: null,
    asOf: null,
    boardUrl: facts.boardUrl,
  };

  if (facts.indexFetched) {
    const session = sessionLevels(facts.indexBars, today);
    const prev = previousClose(facts.indexBars, today);
    if (printKind === "open") {
      if (mins >= NZSX_OPEN_MINUTE && session.open != null) {
        nzsx = {
          status: "print",
          printKind,
          level: session.open,
          changePct: prev ? ((session.open - prev.level) / prev.level) * 100 : null,
          asOf: today,
          boardUrl: facts.boardUrl,
        };
      }
    } else if (mins >= NZSX_CLOSE_MINUTE && session.close != null) {
      nzsx = {
        status: "print",
        printKind,
        level: session.close,
        changePct: prev ? ((session.close - prev.level) / prev.level) * 100 : null,
        asOf: today,
        boardUrl: facts.boardUrl,
      };
    }
  }

  const overview =
    kind !== "monday"
      ? null
      : nzsx.status === "print"
        ? "The New Zealand market is open. This is an illustration of where it sits, not a view on how the week will go."
        : nzsx.status === "not-in"
          ? "The open is not in yet, so this note does not describe the session."
          : null;

  let changedSinceLast: string | null = null;
  let weekSummary: string | null = null;
  if ((kind === "wednesday" || kind === "friday") && facts.indexFetched) {
    const clock = aucklandClock(now);
    const monday = dateOfWeekday(today, clock.weekday, "Mon");
    const wednesday = dateOfWeekday(today, clock.weekday, "Wed");
    const mondayLevel = levelOn(facts.indexBars, monday, "open") ?? levelOn(facts.indexBars, monday, "close");
    if (kind === "wednesday") {
      const endLevel = levelOn(facts.indexBars, today, "open");
      if (mondayLevel != null && endLevel != null) {
        changedSinceLast = moveSentence("Monday's note", mondayLevel, monday, endLevel, today);
      }
    } else {
      const mid = levelOn(facts.indexBars, wednesday, "open") ?? levelOn(facts.indexBars, wednesday, "close");
      const endLevel = levelOn(facts.indexBars, today, "close");
      if (mid != null && endLevel != null) {
        changedSinceLast = moveSentence("Wednesday's note", mid, wednesday, endLevel, today);
      }
      if (mondayLevel != null && endLevel != null) {
        weekSummary = weekSentence(mondayLevel, monday, endLevel, today);
      }
    }
  }

  const windows: { days: number; label: MoverBoard["windowLabel"] }[] =
    kind === "monday"
      ? [
          { days: 7, label: "Last week" },
          { days: 30, label: "Last 30 days" },
        ]
      : [{ days: 7, label: "Last week" }];

  const seen = new Set<string>();
  const accepted: NewsLine[] = [];
  const sorted = [...facts.headlines].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  for (const raw of sorted) {
    const line = acceptHeadline(raw, today, facts.verifiedOcr);
    if (!line) continue;
    const key = line.headline.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    accepted.push(line);
  }
  const weekend = kind === "friday" ? weekendNote(accepted) : null;
  const news = accepted
    .filter((line) => !weekend || !weekend.includes(line.headline))
    .slice(0, kind === "monday" ? 5 : 3);

  return {
    kind,
    generatedOn: formatNoteDate(today),
    nzsx,
    overview,
    changedSinceLast,
    weekSummary,
    boards: boardsFor(facts.markets, today, windows),
    news,
    weekendNote: weekend,
    scenario: acceptAiScenario(facts.scenarioText),
  };
}

export function scenarioFacts(content: ProductNoteContent): string | null {
  const lines: string[] = [];
  if (content.nzsx.status === "print" && content.nzsx.level != null && content.nzsx.asOf) {
    const which = content.nzsx.printKind === "close" ? "closed" : "opened";
    lines.push(`S&P/NZX 50 ${which} at ${formatLevel(content.nzsx.level)} on ${formatNoteDate(content.nzsx.asOf)}.`);
  }
  for (const board of content.boards) {
    for (const row of board.rows) {
      lines.push(`${board.market} ${row.ticker} ${formatPct(row.pct)} from ${row.from} to ${row.to}.`);
    }
  }
  for (const item of content.news) lines.push(`${item.date} ${item.source}: ${item.headline}`);
  if (!lines.length) return null;
  return lines.join("\n");
}

interface Section {
  title?: string;
  lines: string[];
}

function nzsxLines(nzsx: NzsxPrint): string[] {
  if (nzsx.status === "unavailable") {
    return [nzsx.printKind === "close" ? "NZSX close figures are unavailable." : "NZSX open figures are unavailable.", "Full NZSX board", nzsx.boardUrl];
  }
  if (nzsx.status === "not-in") {
    return [nzsx.printKind === "close" ? "The NZSX close is not in yet." : "The NZSX open is not in yet.", "Full NZSX board", nzsx.boardUrl];
  }
  const lines = [
    `The S&P/NZX 50 ${nzsx.printKind === "close" ? "closed" : "opened"} at ${formatLevel(nzsx.level || 0)} on ${formatNoteDate(nzsx.asOf || "")}.`,
  ];
  if (nzsx.changePct != null && Number.isFinite(nzsx.changePct)) {
    lines.push(`That is ${formatPct(nzsx.changePct)} from the previous close.`);
  }
  lines.push("Full NZSX board", nzsx.boardUrl);
  return lines;
}

function boardLines(boards: MoverBoard[], label: MoverBoard["windowLabel"]): string[] {
  const mine = boards.filter((b) => b.windowLabel === label);
  if (!mine.length) return ["This section is unavailable."];
  const lines: string[] = [];
  for (const board of mine) {
    lines.push(board.market);
    if (!board.rows.length) {
      lines.push("No verified share-price increases for this window.");
      continue;
    }
    for (const row of board.rows) {
      lines.push(`${row.ticker} ${row.name}, ${formatPct(row.pct)}, ${formatNoteDate(row.from)} to ${formatNoteDate(row.to)}.`);
    }
  }
  return lines;
}

function newsLines(news: NewsLine[]): string[] {
  if (!news.length) return ["Major news is unavailable."];
  const lines: string[] = [];
  for (const item of news) {
    lines.push(`${item.date}, ${item.source}. ${item.headline}`);
    lines.push(item.url);
  }
  return lines;
}

function sectionsFor(content: ProductNoteContent): Section[] {
  const greeting =
    content.kind === "friday"
      ? "Good afternoon from the team at AetherForge AI."
      : "Good morning from the team at AetherForge AI.";
  const sections: Section[] = [{ lines: [greeting, content.generatedOn] }];

  if (content.kind === "monday") {
    sections.push({ title: "NZSX at the open", lines: nzsxLines(content.nzsx) });
    sections.push({
      title: "Where the market sits",
      lines: [content.overview || "A verified overview is unavailable."],
    });
    sections.push({ title: "Last week, top share-price increases", lines: boardLines(content.boards, "Last week") });
    sections.push({ title: "Last 30 days, top share-price increases", lines: boardLines(content.boards, "Last 30 days") });
  } else {
    if (content.kind === "friday") {
      sections.push({ title: "NZSX at the close", lines: nzsxLines(content.nzsx) });
    }
    sections.push({
      title: "Since the last note",
      lines: [content.changedSinceLast || "What changed since the last note is unavailable."],
    });
    if (content.kind === "friday") {
      sections.push({
        title: "This week",
        lines: [content.weekSummary || "A verified summary of this week's activity is unavailable."],
      });
    }
    sections.push({ title: "Top movers", lines: boardLines(content.boards, "Last week") });
  }

  sections.push({ title: "New major news", lines: newsLines(content.news) });
  if (content.weekendNote) sections.push({ title: "Over the weekend", lines: [content.weekendNote] });
  sections.push({
    title: "Illustrative scenario",
    lines: content.scenario
      ? ["It is not a forecast, and it is not an instruction to buy or sell.", content.scenario]
      : ["An AI explanation is unavailable."],
  });
  sections.push({
    lines: [
      content.kind === "friday"
        ? "Wishing you a good weekend."
        : content.kind === "wednesday"
          ? "Wishing you a good rest of the week."
          : "Wishing you a good week.",
      PRODUCT_NOTE_DISCLAIMER,
    ],
  });
  return sections;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderProductNote(content: ProductNoteContent): RenderedProductNote {
  const sections = sectionsFor(content);
  const text = sections
    .map((s) => [s.title, ...s.lines].filter(Boolean).join("\n"))
    .join("\n\n");
  const htmlParts = sections.map((s) => {
    const heading = s.title ? `<h2>${esc(s.title)}</h2>` : "";
    const body = s.lines
      .map((line) =>
        line.startsWith("https://") || line.startsWith("http://")
          ? `<p><a href="${esc(line)}">${esc(line)}</a></p>`
          : `<p>${esc(line)}</p>`
      )
      .join("");
    return `${heading}${body}`;
  });
  const html = `<style>
  .note { font-family: Georgia, "Times New Roman", serif; color: #1c1917; line-height: 1.45; }
  a { color: #1d4e89; }
</style>
<div class="note">${htmlParts.join("")}</div>`;
  return { subject: SUBJECT[content.kind], text, html };
}

export async function runProductNoteJob(args: {
  now: Date;
  env?: { PRODUCT_NOTE_SEND?: string };
  loadRecipients: () => Promise<{ email: string }[]>;
  build: (kind: ProductNoteKind, now: Date) => Promise<RenderedProductNote>;
  send: (message: OutboundProductNote) => Promise<void>;
}): Promise<ProductNoteJobResult["body"]> {
  if (!productNoteSendingEnabled(args.env)) {
    return { ok: true, sent: 0, sender: "off", reason: "sender-off" };
  }
  const kind = productNoteKindAt(args.now);
  if (!kind) {
    return { ok: true, sent: 0, sender: "on", reason: "outside-window", kind: null };
  }
  const recipients = dedupeRecipients(await args.loadRecipients());
  if (!recipients.length) {
    return { ok: true, sent: 0, sender: "on", reason: "no-recipients", kind };
  }
  const note = await args.build(kind, args.now);
  let sent = 0;
  for (const recipient of recipients) {
    await args.send({
      to: recipient.email,
      from: PRODUCT_NOTE_FROM,
      fromName: "AetherForge AI",
      replyTo: PRODUCT_NOTE_FROM,
      subject: note.subject,
      text: note.text,
      html: note.html,
    });
    sent += 1;
  }
  return { ok: true, sent, sender: "on", reason: "sent", kind };
}

function presentedSecret(url: string, headers: { get(name: string): string | null }): string | null {
  const q = new URL(url).searchParams.get("key") || new URL(url).searchParams.get("secret");
  if (q) return q;
  const header = headers.get("x-cron-secret");
  if (header) return header;
  const auth = headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return null;
}

/**
 * HTTP gate for the product-note route.
 * A missing secret refuses the call. A present secret still does not send
 * unless PRODUCT_NOTE_SEND is exactly "on" and the Auckland clock is in a slot.
 */
export async function handleProductNoteRequest(args: {
  url: string;
  headers: { get(name: string): string | null };
  env: { CRON_SECRET?: string; PRODUCT_NOTE_SEND?: string };
  now: Date;
  loadRecipients: () => Promise<{ email: string }[]>;
  build: (kind: ProductNoteKind, now: Date) => Promise<RenderedProductNote>;
  send: (message: OutboundProductNote) => Promise<void>;
}): Promise<ProductNoteJobResult> {
  if (!args.env.CRON_SECRET) {
    return {
      status: 503,
      body: { ok: false, sent: 0, sender: "off", reason: "cron-not-configured" },
    };
  }
  if (presentedSecret(args.url, args.headers) !== args.env.CRON_SECRET) {
    return { status: 401, body: { ok: false, sent: 0, sender: "off", reason: "unauthorized" } };
  }
  try {
    const body = await runProductNoteJob({
      now: args.now,
      env: args.env,
      loadRecipients: args.loadRecipients,
      build: args.build,
      send: args.send,
    });
    return { status: 200, body };
  } catch {
    return { status: 500, body: { ok: false, sent: 0, sender: "on", reason: "failed" } };
  }
}

export function parseRssItems(xml: string): { title: string; link: string; publishedAt: string }[] {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  const out: { title: string; link: string; publishedAt: string }[] = [];
  for (const block of blocks) {
    const title = (block.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "")
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const link = (block.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] || "")
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .trim();
    const publishedAt = (block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1] || "").trim();
    if (title && link && publishedAt) out.push({ title, link, publishedAt });
  }
  return out;
}
