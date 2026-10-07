/**
 * Additive report lines for Stox, Koins, and Headmaster.
 * Existing sections stay. These helpers only add a score, a size, or a sentence.
 */

import { modelByKey } from "@/lib/totalum-engine";
import type { TickerAnalysis } from "@/lib/apex";
import type { SharedBookLog } from "@/lib/book-log";
import { modelViewSentence } from "@/lib/headmaster-trust";

export { modelViewSentence };

const SHORT_SAMPLE = 5;

export interface SevenDayCall {
  id: string;
  ticker: string;
  issuedAtMs: number;
  bearLow: number;
  bearHigh: number;
  baseLow: number;
  baseHigh: number;
  bullLow: number;
  bullHigh: number;
}

export interface ClosedCallScore {
  bear: number;
  base: number;
  bull: number;
  outside: number;
  closed: number;
  scoredIds: string[];
  shortSample: boolean;
  sentence: string;
}

export type LandedBand = "bear" | "base" | "bull" | "outside";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function emptyClosedCallScore(): ClosedCallScore {
  return {
    bear: 0,
    base: 0,
    bull: 0,
    outside: 0,
    closed: 0,
    scoredIds: [],
    shortSample: true,
    sentence: closedCallSentence(0, 0, 0, 0),
  };
}

function contains(price: number, low: number, high: number): boolean {
  const lo = Math.min(low, high);
  const hi = Math.max(low, high);
  return price >= lo && price <= hi;
}

/** Which expired band the later price sits in. Overlaps prefer the narrower band. */
export function landBand(
  price: number,
  call: Pick<SevenDayCall, "bearLow" | "bearHigh" | "baseLow" | "baseHigh" | "bullLow" | "bullHigh">
): LandedBand {
  if (!(price > 0)) return "outside";
  const bands: { name: LandedBand; low: number; high: number }[] = [
    { name: "base", low: call.baseLow, high: call.baseHigh },
    { name: "bear", low: call.bearLow, high: call.bearHigh },
    { name: "bull", low: call.bullLow, high: call.bullHigh },
  ];
  const hits = bands.filter((b) => contains(price, b.low, b.high));
  if (!hits.length) return "outside";
  hits.sort((a, b) => Math.abs(a.high - a.low) - Math.abs(b.high - b.low));
  return hits[0].name;
}

export function closedCallSentence(bear: number, base: number, bull: number, outside: number): string {
  const closed = bear + base + bull + outside;
  const short = closed < SHORT_SAMPLE;
  const count = `Closed 7-day ranges: ${bear} landed in the bear band, ${base} in the base band, ${bull} in the bull band, ${outside} outside those bands.`;
  const tail = short
    ? " The sample is short, so this is a count only."
    : " This is a count of where price landed.";
  return count + tail;
}

/**
 * Add newly expired ranges to the running count.
 * A range is closed only after seven days and only when a real later price exists.
 * The sentence is counts. It never states a hit rate.
 */
export function rollClosedCallScore(
  prior: ClosedCallScore | null,
  calls: SevenDayCall[],
  prices: Record<string, number>,
  nowMs: number
): ClosedCallScore {
  const base = prior ?? emptyClosedCallScore();
  const scored = new Set(base.scoredIds);
  let bear = base.bear;
  let baseN = base.base;
  let bull = base.bull;
  let outside = base.outside;
  for (const call of calls) {
    if (scored.has(call.id)) continue;
    if (nowMs - call.issuedAtMs < WEEK_MS) continue;
    const price = prices[call.ticker.toUpperCase()];
    if (!(price > 0)) continue;
    const band = landBand(price, call);
    if (band === "bear") bear += 1;
    else if (band === "base") baseN += 1;
    else if (band === "bull") bull += 1;
    else outside += 1;
    scored.add(call.id);
  }
  const closed = bear + baseN + bull + outside;
  return {
    bear,
    base: baseN,
    bull,
    outside,
    closed,
    scoredIds: [...scored],
    shortSample: closed < SHORT_SAMPLE,
    sentence: closedCallSentence(bear, baseN, bull, outside),
  };
}

export function openCallFromTicker(ticker: TickerAnalysis, issuedAtMs: number): SevenDayCall | null {
  const call = ticker.call;
  if (!call) return null;
  return {
    id: `${ticker.ticker.toUpperCase()}:${issuedAtMs}`,
    ticker: ticker.ticker.toUpperCase(),
    issuedAtMs,
    bearLow: call.bear[0],
    bearHigh: call.bear[1],
    baseLow: call.base[0],
    baseHigh: call.base[1],
    bullLow: call.bull[0],
    bullHigh: call.bull[1],
  };
}

export function sleeveWeightPct(bot: "stock" | "crypto"): number {
  const model = modelByKey("balanced_growth");
  if (!model) return bot === "crypto" ? 20 : 55;
  return bot === "crypto" ? model.targets.crypto : model.targets.equities;
}

/**
 * Illustrated dollars for one name.
 * High recent volatility shrinks the size.
 * The cash reserve and the Headmaster sleeve weight are hard caps.
 */
export function illustratedSizeNZD(input: {
  cashNZD: number;
  bookNZD: number;
  sleeveWeightPct: number;
  realizedVolPct: number | null;
  names: number;
}): number {
  const cash = Math.max(0, input.cashNZD);
  const book = Math.max(0, input.bookNZD);
  const reserve = Math.round((book * 10) / 100);
  const deployable = Math.max(0, cash - reserve);
  const sleeveCap = (book * Math.max(0, input.sleeveWeightPct)) / 100;
  const room = Math.min(deployable, sleeveCap);
  const names = Math.max(1, input.names);
  const baseline = 20;
  const vol = input.realizedVolPct;
  const scale = vol == null || !(vol > baseline) ? 1 : baseline / vol;
  const sized = (room / names) * scale;
  return Math.round(sized * 100) / 100;
}

/** Reports do not invent a brokerage figure. The default is zero. */
export function paperFeeNZD(_notionalNZD: number, _ticker: string, _assetType: "stock" | "crypto"): number {
  return 0;
}

/** Always names the paper fee, including zero. */
export function paperFeeSentence(feeNZD: number): string {
  const fee = Number.isFinite(feeNZD) ? Math.max(0, feeNZD) : 0;
  const text = fee.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `The range is before fees and spread. Paper fee NZ$${text}.`;
}

export function tickerCallSentence(
  ticker: TickerAnalysis,
  sizeNZD: number,
  feeNZD: number
): string {
  const call = ticker.call;
  const horizon = call?.horizon ?? "7-day";
  const range = call?.range ?? "range unavailable";
  const odds = call ? `${call.oddsPct}% stated odds` : "stated odds unavailable";
  const kill =
    call && call.killPrice > 0
      ? `A level that kills the idea is ${call.killPrice}.`
      : "A level that kills the idea is not available from this print.";
  const volNote =
    call?.realizedVolPct != null && call.realizedVolPct > 20
      ? " Illustrated size is smaller because recent volatility was high."
      : "";
  const size = `Illustrated size NZ$${sizeNZD.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}, inside the cash reserve and the Headmaster sleeve weight.${volNote}`;
  return `${ticker.ticker}: horizon ${horizon}, range ${range}, ${odds}. ${kill} ${size} ${paperFeeSentence(feeNZD)}`;
}

export function annotateTickerCalls(
  tickers: TickerAnalysis[],
  book: Pick<SharedBookLog, "cashNZD" | "netWorthNZD"> | null,
  bot: "stock" | "crypto"
): TickerAnalysis[] {
  const names = tickers.filter((t) => !t.priceUnavailable).length || tickers.length || 1;
  const weight = sleeveWeightPct(bot);
  return tickers.map((ticker) => {
    if (ticker.priceUnavailable) {
      const extra = `${ticker.ticker} stays on the report. Live price unavailable.`;
      return { ...ticker, note: ticker.note.includes("Live price unavailable") ? ticker.note : `${ticker.note} ${extra}` };
    }
    const size = book
      ? illustratedSizeNZD({
          cashNZD: book.cashNZD,
          bookNZD: book.netWorthNZD,
          sleeveWeightPct: weight,
          realizedVolPct: ticker.call?.realizedVolPct ?? null,
          names,
        })
      : 0;
    const fee = paperFeeNZD(size, ticker.ticker, bot);
    const line = tickerCallSentence(ticker, size, fee);
    if (ticker.note.includes("Paper fee NZ$")) return ticker;
    return { ...ticker, note: `${ticker.note} ${line}` };
  });
}

export interface KoinsHoldingLine {
  ticker: string;
  name: string;
  shares: number;
  price: number | null;
  priceStatus: "live" | "unavailable";
  sentence: string;
}

/** A recorded crypto or DEX holding stays on the Koins report. A missing print is said, not filled in. */
export function koinsHoldingLine(input: {
  ticker: string;
  name?: string;
  shares: number;
  livePrice: number | null;
}): KoinsHoldingLine {
  const ticker = input.ticker.trim().toUpperCase();
  const name = input.name || ticker;
  const shares = input.shares;
  const live = input.livePrice != null && input.livePrice > 0 ? input.livePrice : null;
  if (live == null) {
    return {
      ticker,
      name,
      shares,
      price: null,
      priceStatus: "unavailable",
      sentence: `${ticker} (${name}) is on the Koins book, ${shares} units. Live price unavailable.`,
    };
  }
  return {
    ticker,
    name,
    shares,
    price: live,
    priceStatus: "live",
    sentence: `${ticker} (${name}) is on the Koins book, ${shares} units, live price ${live}.`,
  };
}

export function koinsCoverageSentences(
  holdings: Array<{ ticker: string; name?: string; shares: number; livePrice: number | null }>
): string[] {
  return holdings.filter((h) => h.ticker && h.shares > 0).map((h) => koinsHoldingLine(h).sentence);
}

function isSevenDayCall(value: unknown): value is SevenDayCall {
  if (!value || typeof value !== "object") return false;
  const row = value as SevenDayCall;
  return typeof row.id === "string" && typeof row.ticker === "string" && typeof row.issuedAtMs === "number";
}

/** Read earlier saved reports so a later price can close a 7-day range. */
export function priorCallsFromPayloads(payloads: unknown[]): { score: ClosedCallScore | null; calls: SevenDayCall[] } {
  let score: ClosedCallScore | null = null;
  const calls: SevenDayCall[] = [];
  for (const raw of payloads) {
    let parsed: unknown = raw;
    if (typeof raw === "string") {
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue;
      }
    }
    if (!parsed || typeof parsed !== "object") continue;
    const row = parsed as { closedCallScore?: ClosedCallScore; openCalls?: unknown[] };
    if (!score && row.closedCallScore && typeof row.closedCallScore.sentence === "string") {
      score = row.closedCallScore;
    }
    if (Array.isArray(row.openCalls)) {
      for (const call of row.openCalls) {
        if (isSevenDayCall(call)) calls.push(call);
      }
    }
  }
  return { score, calls };
}
