/**
 * Append-only daily closes, backfill, and the comparison with report signals.
 * No network. A missing bar stays missing. A directory seed is not a close.
 */

import { signalRowFromPick, type StoredSignalReport } from "@/lib/chat-signals";
import { resolveExchange } from "@/lib/market-intel";
import { dailyPriceDirectory, type DirectoryName } from "@/lib/daily-price-directory";
import {
  completedSessionDates,
  isAucklandCaptureWindow,
  lastCompletedSessionDate,
  aucklandWall,
} from "@/lib/daily-price-schedule";
import {
  DATA_LICENCE_REVIEW,
  historyStoreAllowed,
  type DailyMarket,
  type DailyPriceFeed,
} from "@/lib/daily-price-sources";

export const HISTORY_UNAVAILABLE = "history unavailable";
export const BACKFILL_SESSIONS = 20;

export interface DailyCloseRow {
  date: string;
  market: DailyMarket;
  symbol: string;
  close: number;
  change: number | null;
  source: string;
  captured_at: string;
}

export interface DailyPriceStore {
  find(date: string, market: string, symbol: string): Promise<DailyCloseRow | null>;
  insert(row: DailyCloseRow): Promise<void>;
  list(): Promise<DailyCloseRow[]>;
}

export type AppendResult = "inserted" | "exists" | "rejected";

const MARKETS = new Set<DailyMarket>(["NZX", "ASX", "DOW", "NASDAQ"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function idemKey(date: string, market: string, symbol: string): string {
  return `${date}|${market}|${symbol.toUpperCase()}`;
}

export function memoryDailyPriceStore(seed: DailyCloseRow[] = []): DailyPriceStore {
  const rows = [...seed];
  return {
    async find(date, market, symbol) {
      const key = idemKey(date, market, symbol);
      const hits = rows.filter((row) => idemKey(row.date, row.market, row.symbol) === key);
      return canonicalRow(hits);
    },
    async insert(row) {
      rows.push({ ...row, symbol: row.symbol.toUpperCase() });
    },
    async list() {
      return rows.map((row) => ({ ...row }));
    },
  };
}

/** Earliest capture wins. Later rows for the same key are ignored and not deleted. */
export function canonicalRow(rows: readonly DailyCloseRow[]): DailyCloseRow | null {
  let best: DailyCloseRow | null = null;
  for (const row of rows) {
    if (!best || row.captured_at < best.captured_at) best = row;
  }
  return best ? { ...best } : null;
}

function finiteChange(value: number | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

export async function appendDailyClose(
  store: DailyPriceStore,
  row: DailyCloseRow,
  feeds?: readonly DailyPriceFeed[]
): Promise<AppendResult> {
  if (!DATE_RE.test(row.date) || !MARKETS.has(row.market)) return "rejected";
  const symbol = row.symbol.trim().toUpperCase();
  if (!symbol) return "rejected";
  if (typeof row.close !== "number" || !Number.isFinite(row.close) || !(row.close > 0)) return "rejected";
  if (row.change != null && (typeof row.change !== "number" || !Number.isFinite(row.change))) return "rejected";
  if (!row.source.trim() || !historyStoreAllowed(row.source, feeds)) return "rejected";
  if (!row.captured_at || Number.isNaN(Date.parse(row.captured_at))) return "rejected";
  const existing = await store.find(row.date, row.market, symbol);
  if (existing) return "exists";
  await store.insert({
    date: row.date,
    market: row.market,
    symbol,
    close: row.close,
    change: finiteChange(row.change),
    source: row.source.trim().toLowerCase(),
    captured_at: row.captured_at,
  });
  return "inserted";
}

export interface FeedBar {
  date: string;
  close: number | null;
  /** Present only when the feed sent a session change. */
  change?: number | null;
}

/**
 * Exact session dates only. A missing or non-positive close is left out.
 * An earlier bar is not copied forward.
 */
export function exactBars(bars: readonly FeedBar[], dates: readonly string[]): FeedBar[] {
  const want = new Set(dates);
  const seen = new Set<string>();
  const out: FeedBar[] = [];
  for (const bar of bars) {
    if (!want.has(bar.date) || seen.has(bar.date)) continue;
    if (typeof bar.close !== "number" || !Number.isFinite(bar.close) || !(bar.close > 0)) continue;
    if (bar.change != null && (typeof bar.change !== "number" || !Number.isFinite(bar.change))) continue;
    seen.add(bar.date);
    out.push({ date: bar.date, close: bar.close, change: finiteChange(bar.change) });
  }
  return out;
}

export interface FeedPrint {
  date: string;
  market: DailyMarket;
  symbol: string;
  close: number;
  change: number | null;
  source: string;
}

export function printsFromBars(input: {
  market: DailyMarket;
  symbol: string;
  source: string;
  bars: readonly FeedBar[];
  dates: readonly string[];
}): FeedPrint[] {
  return exactBars(input.bars, input.dates).map((bar) => ({
    date: bar.date,
    market: input.market,
    symbol: input.symbol.toUpperCase(),
    close: bar.close as number,
    change: bar.change ?? null,
    source: input.source,
  }));
}

export interface CaptureSkip {
  source: string;
  reason: typeof DATA_LICENCE_REVIEW | "missing-feed";
}

export interface CaptureReport {
  ran: boolean;
  reason: string;
  inserted: number;
  existing: number;
  gaps: number;
  skipped: CaptureSkip[];
}

export async function captureDailyCloses(args: {
  now: Date;
  force?: boolean;
  store: DailyPriceStore;
  feeds: readonly DailyPriceFeed[];
  names?: readonly DirectoryName[];
  sessions?: number;
  readFeed: (feed: DailyPriceFeed, market: DailyMarket, symbol: string, dates: readonly string[]) => Promise<readonly FeedBar[] | null>;
}): Promise<CaptureReport> {
  if (!args.force && !isAucklandCaptureWindow(args.now)) {
    return { ran: false, reason: "outside-auckland-window", inserted: 0, existing: 0, gaps: 0, skipped: [] };
  }
  const names = args.names ?? dailyPriceDirectory();
  const sessions = args.sessions ?? 1;
  let inserted = 0;
  let existing = 0;
  let gaps = 0;
  const skipped: CaptureSkip[] = [];
  for (const feed of args.feeds) {
    if (!historyStoreAllowed(feed.id, args.feeds)) {
      skipped.push({ source: feed.id, reason: DATA_LICENCE_REVIEW });
      continue;
    }
    for (const market of feed.markets) {
      const dates = completedSessionDates(market, args.now, sessions);
      const symbols = names.filter((name) => name.market === market);
      for (const name of symbols) {
        let bars: readonly FeedBar[] | null;
        try {
          bars = await args.readFeed(feed, market, name.symbol, dates);
        } catch {
          bars = null;
        }
        if (bars == null) {
          gaps += dates.length;
          skipped.push({ source: feed.id, reason: "missing-feed" });
          continue;
        }
        const prints = printsFromBars({ market, symbol: name.symbol, source: feed.id, bars, dates });
        const found = new Set(prints.map((print) => print.date));
        gaps += dates.filter((date) => !found.has(date)).length;
        for (const print of prints) {
          const result = await appendDailyClose(
            args.store,
            { ...print, captured_at: args.now.toISOString() },
            args.feeds
          );
          if (result === "inserted") inserted += 1;
          else if (result === "exists") existing += 1;
        }
      }
    }
  }
  return { ran: true, reason: "captured", inserted, existing, gaps, skipped };
}

export interface SessionBoardRow {
  market: DailyMarket;
  symbol: string;
  name: string;
  role: "index" | "constituent";
  date: string;
  close: number | null;
  change: number | null;
  source: string | null;
  captured_at: string | null;
}

export function buildSessionBoard(input: {
  now: Date;
  rows: readonly DailyCloseRow[];
  names?: readonly DirectoryName[];
}): SessionBoardRow[] {
  const names = input.names ?? dailyPriceDirectory();
  const byKey = new Map<string, DailyCloseRow[]>();
  const latestByMarket = new Map<string, string>();
  for (const row of input.rows) {
    const key = `${row.market}|${row.symbol.toUpperCase()}`;
    const list = byKey.get(key);
    if (list) list.push(row);
    else byKey.set(key, [row]);
    const session = latestByMarket.get(row.market);
    if (!session || row.date > session) latestByMarket.set(row.market, row.date);
  }
  return names.map((name) => {
    const stored = byKey.get(`${name.market}|${name.symbol.toUpperCase()}`) ?? [];
    const date = latestByMarket.get(name.market) ?? lastCompletedSessionDate(name.market, input.now);
    const chosen = canonicalRow(stored.filter((row) => row.date === date));
    return {
      market: name.market,
      symbol: name.symbol,
      name: name.name,
      role: name.role,
      date,
      close: chosen?.close ?? null,
      change: chosen?.change ?? null,
      source: chosen?.source ?? null,
      captured_at: chosen?.captured_at ?? null,
    };
  });
}

export interface PredictionRef {
  date: string;
  market: DailyMarket | null;
  symbol: string;
  label: string;
  predictedPrice: number;
  origin: "report";
  asOf: string;
}

export function predictionsFromReports(records: readonly StoredSignalReport[]): PredictionRef[] {
  const out: PredictionRef[] = [];
  for (const record of records) {
    const asOf = String(record.generatedAt || "").trim();
    if (!asOf || Number.isNaN(Date.parse(asOf))) continue;
    const date = aucklandWall(new Date(asOf)).iso;
    const payload = parseReportPayload(record.payload);
    const tickers = Array.isArray(payload?.tickers) ? payload.tickers : [];
    for (const pick of tickers) {
      const signal = signalRowFromPick(pick, asOf, record.bot);
      if (!signal || !(signal.predictedPrice > 0)) continue;
      const market = marketForSignal(signal.ticker, signal.exchange);
      out.push({
        date,
        market,
        symbol: signal.ticker.toUpperCase(),
        label: signal.label,
        predictedPrice: signal.predictedPrice,
        origin: "report",
        asOf,
      });
    }
  }
  return out;
}

function marketForSignal(ticker: string, exchange: string): DailyMarket | null {
  if (exchange === "NZX") return "NZX";
  if (exchange === "ASX") return "ASX";
  if (exchange === "CRYPTO") return null;
  const resolved = resolveExchange(ticker, "US");
  return resolved;
}

function parseReportPayload(payload: unknown): { tickers?: Parameters<typeof signalRowFromPick>[0][] } | null {
  if (payload && typeof payload === "object") return payload as { tickers?: Parameters<typeof signalRowFromPick>[0][] };
  if (typeof payload !== "string" || !payload.trim()) return null;
  try {
    const parsed = JSON.parse(payload) as { tickers?: Parameters<typeof signalRowFromPick>[0][] };
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export interface ComparisonLine {
  date: string;
  market: string | null;
  symbol: string;
  close: number | null;
  change: number | null;
  source: string | null;
  captured_at: string | null;
  label: string | null;
  predictedPrice: number | null;
  predictionOrigin: "report" | null;
}

export function joinClosesAndPredictions(
  closes: readonly DailyCloseRow[],
  predictions: readonly PredictionRef[]
): ComparisonLine[] {
  type Acc = { close: DailyCloseRow | null; prediction: PredictionRef | null };
  const map = new Map<string, Acc>();
  const keyOf = (date: string, symbol: string) => `${date}|${symbol.toUpperCase()}`;
  for (const row of closes) {
    const key = keyOf(row.date, row.symbol);
    const acc = map.get(key) ?? { close: null, prediction: null };
    const current = acc.close;
    if (!current || row.captured_at < current.captured_at) acc.close = row;
    map.set(key, acc);
  }
  for (const prediction of predictions) {
    const key = keyOf(prediction.date, prediction.symbol);
    const acc = map.get(key) ?? { close: null, prediction: null };
    if (!acc.prediction || prediction.asOf > acc.prediction.asOf) acc.prediction = prediction;
    map.set(key, acc);
  }
  const lines: ComparisonLine[] = [];
  for (const [key, acc] of map) {
    const [date, symbol] = key.split("|");
    lines.push({
      date,
      market: acc.close?.market ?? acc.prediction?.market ?? null,
      symbol,
      close: acc.close?.close ?? null,
      change: acc.close?.change ?? null,
      source: acc.close?.source ?? null,
      captured_at: acc.close?.captured_at ?? null,
      label: acc.prediction?.label ?? null,
      predictedPrice: acc.prediction?.predictedPrice ?? null,
      predictionOrigin: acc.prediction?.origin ?? null,
    });
  }
  lines.sort((a, b) => (a.date === b.date ? a.symbol.localeCompare(b.symbol) : b.date.localeCompare(a.date)));
  return lines;
}

function csvCell(value: string): string {
  let text = value;
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function comparisonCsv(lines: readonly ComparisonLine[]): string {
  const header = ["date", "market", "symbol", "close", "change", "source", "captured_at", "label", "predicted_price", "prediction_origin"];
  const body = lines.map((line) =>
    [
      line.date,
      line.market ?? "",
      line.symbol,
      line.close == null ? "" : String(line.close),
      line.change == null ? "" : String(line.change),
      line.source ?? "",
      line.captured_at ?? "",
      line.label ?? "",
      line.predictedPrice == null ? "" : String(line.predictedPrice),
      line.predictionOrigin ?? "",
    ]
      .map(csvCell)
      .join(",")
  );
  return [header.join(","), ...body].join("\n");
}

export function boardToComparison(board: readonly SessionBoardRow[], predictions: readonly PredictionRef[]): ComparisonLine[] {
  const closes: DailyCloseRow[] = [];
  for (const row of board) {
    if (row.close == null || !row.source || !row.captured_at) continue;
    closes.push({
      date: row.date,
      market: row.market,
      symbol: row.symbol,
      close: row.close,
      change: row.change,
      source: row.source,
      captured_at: row.captured_at,
    });
  }
  const joined = joinClosesAndPredictions(closes, predictions);
  const seen = new Set(joined.map((line) => `${line.date}|${line.symbol}`));
  for (const row of board) {
    const key = `${row.date}|${row.symbol}`;
    if (seen.has(key)) continue;
    joined.push({
      date: row.date,
      market: row.market,
      symbol: row.symbol,
      close: null,
      change: null,
      source: null,
      captured_at: null,
      label: null,
      predictedPrice: null,
      predictionOrigin: null,
    });
  }
  joined.sort((a, b) => (a.date === b.date ? a.symbol.localeCompare(b.symbol) : b.date.localeCompare(a.date)));
  return joined;
}
