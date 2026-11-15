import "server-only";

import { aucklandWall } from "@/lib/daily-price-schedule";
import { TWELVE_DATA_SOURCE } from "@/lib/daily-price-twelve";
import { DAILY_PRICE_CLOSE } from "@/lib/schema/daily-price-history.schema";
import { flagOn } from "@/lib/schema/types";
import { totalumSdk } from "@/lib/totalum";
import {
  HISTORY_PAGE_SIZE,
  HISTORY_UNAVAILABLE,
  absorbHistoryPage,
  canonicalRow,
  createHistoryReadState,
  predictionsFromReports,
  type DailyCloseRow,
  type DailyPriceStore,
  type PredictionRef,
} from "@/lib/daily-price-history";
import type { StoredSignalReport } from "@/lib/chat-signals";

export function dailyPriceHistoryEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return flagOn("DAILY_PRICE_HISTORY_TABLE", env);
}

function asRow(raw: Record<string, unknown>): DailyCloseRow | null {
  const date = String(raw.date || "").slice(0, 10);
  const market = String(raw.market || "");
  const symbol = String(raw.symbol || "").toUpperCase();
  const close = Number(raw.close);
  const source = String(raw.source || "");
  const captured = raw.captured_at;
  const capturedAt = typeof captured === "string" ? captured : captured ? String(captured) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (market !== "NZX" && market !== "ASX" && market !== "DOW" && market !== "NASDAQ") return null;
  if (!symbol || !(close > 0) || !Number.isFinite(close) || !source || !capturedAt) return null;
  const changeRaw = raw.change;
  const change = changeRaw == null || changeRaw === "" ? null : Number(changeRaw);
  return {
    date,
    market,
    symbol,
    close,
    change: change != null && Number.isFinite(change) ? change : null,
    source,
    captured_at: capturedAt,
  };
}

async function queryClosePage(offset: number): Promise<Record<string, unknown>[]> {
  const res = await totalumSdk.crud.query(DAILY_PRICE_CLOSE.table, {
    _limit: HISTORY_PAGE_SIZE,
    _offset: offset,
    _sort: { date: "desc" },
  } as never);
  return ((res as { data?: Array<Record<string, unknown>> })?.data || []);
}

/** Newest session for each market. Pages are newest-first so a 5000 cap cannot hide that session. */
export async function readDailyPriceHistory(
  env: Record<string, string | undefined> = process.env
): Promise<{ ok: true; rows: DailyCloseRow[] } | { ok: false; reason: typeof HISTORY_UNAVAILABLE }> {
  if (!dailyPriceHistoryEnabled(env)) return { ok: false, reason: HISTORY_UNAVAILABLE };
  try {
    const state = createHistoryReadState();
    let offset = 0;
    let previousMarker = "";
    for (let page = 0; page < 40; page++) {
      const raw = await queryClosePage(offset);
      const marker = String(raw[0]?._id || raw[0]?.idem_key || "");
      if (page > 0 && marker && marker === previousMarker) break;
      previousMarker = marker;
      const rows = raw.map(asRow).filter((row): row is DailyCloseRow => !!row && row.source === TWELVE_DATA_SOURCE);
      const step = absorbHistoryPage(state, rows, raw.length, HISTORY_PAGE_SIZE);
      if (!step.continue) break;
      offset += raw.length;
      if (!raw.length) break;
    }
    const grouped = new Map<string, DailyCloseRow[]>();
    for (const row of state.kept) {
      const key = `${row.date}|${row.market}|${row.symbol}`;
      const list = grouped.get(key);
      if (list) list.push(row);
      else grouped.set(key, [row]);
    }
    const rows: DailyCloseRow[] = [];
    for (const list of grouped.values()) {
      const chosen = canonicalRow(list);
      if (chosen) rows.push(chosen);
    }
    return { ok: true, rows };
  } catch (err) {
    console.error("[daily-prices] history read failed:", err instanceof Error ? err.message.slice(0, 120) : "failed");
    return { ok: false, reason: HISTORY_UNAVAILABLE };
  }
}

export interface StoredCloseScan {
  keys: Set<string>;
  /** Distinct symbols with a row captured on today's Auckland date. One symbol is one credit. */
  creditsToday: number;
  /** One stamp per symbol captured in the last minute, so the next run keeps the per-minute pace. */
  recentStamps: number[];
}

/** Stored idem keys for the dates a capture might write, plus today's credit count. No extra table. */
export async function listStoredCloseKeys(dates: ReadonlySet<string>, now = new Date()): Promise<StoredCloseScan | null> {
  if (!dates.size) return { keys: new Set(), creditsToday: 0, recentStamps: [] };
  try {
    const keys = new Set<string>();
    const today = aucklandWall(now).iso;
    const symbolsToday = new Set<string>();
    const recent = new Map<string, number>();
    const recentAfter = now.getTime() - 60_000;
    let offset = 0;
    let previousMarker = "";
    for (let page = 0; page < 40; page++) {
      const raw = await queryClosePage(offset);
      const marker = String(raw[0]?._id || raw[0]?.idem_key || "");
      if (page > 0 && marker && marker === previousMarker) break;
      previousMarker = marker;
      for (const item of raw) {
        const row = asRow(item);
        if (!row || row.source !== TWELVE_DATA_SOURCE) continue;
        const capturedMs = Date.parse(row.captured_at);
        if (Number.isFinite(capturedMs) && aucklandWall(new Date(capturedMs)).iso === today) {
          const symbolKey = `${row.market}|${row.symbol}`;
          symbolsToday.add(symbolKey);
          if (capturedMs >= recentAfter) {
            const prior = recent.get(symbolKey) ?? 0;
            if (capturedMs > prior) recent.set(symbolKey, capturedMs);
          }
        }
        if (!dates.has(row.date)) continue;
        keys.add(`${row.date}|${row.market}|${row.symbol}`);
      }
      if (raw.length < HISTORY_PAGE_SIZE) break;
      offset += raw.length;
    }
    return { keys, creditsToday: symbolsToday.size, recentStamps: [...recent.values()] };
  } catch (err) {
    console.error("[daily-prices] stored-key read failed:", err instanceof Error ? err.message.slice(0, 120) : "failed");
    return null;
  }
}

export function totalumDailyPriceStore(env: Record<string, string | undefined> = process.env): DailyPriceStore | null {
  if (!dailyPriceHistoryEnabled(env)) return null;
  const table = DAILY_PRICE_CLOSE.table;
  return {
    async find(date, market, symbol) {
      const idem = `${date}|${market}|${symbol.toUpperCase()}`;
      const res = await totalumSdk.crud.query(table, { _filter: { idem_key: idem }, _limit: 5 } as never);
      const rows = ((res as { data?: Array<Record<string, unknown>> })?.data || [])
        .map(asRow)
        .filter((row): row is DailyCloseRow => !!row);
      return canonicalRow(rows);
    },
    async insert(row) {
      await totalumSdk.crud.createRecord(table, {
        date: row.date,
        market: row.market,
        symbol: row.symbol,
        close: row.close,
        ...(row.change == null ? {} : { change: row.change }),
        source: row.source,
        captured_at: row.captured_at,
        idem_key: `${row.date}|${row.market}|${row.symbol}`,
      } as never);
    },
    async list() {
      const loaded = await readDailyPriceHistory(env);
      if (!loaded.ok) return [];
      return loaded.rows;
    },
  };
}

export async function loadReportPredictions(userId: string): Promise<PredictionRef[]> {
  try {
    const res = await totalumSdk.crud.query("report", {
      _filter: { user: userId },
      _sort: { createdAt: "desc" },
      _limit: 40,
    });
    const rows = ((res as { data?: Array<Record<string, unknown>> })?.data || []);
    const records: StoredSignalReport[] = rows.map((row) => {
      const generatedAt = row.generated_at || row.createdAt;
      const bot = row.bot === "crypto" ? "crypto" : "stock";
      return {
        bot,
        generatedAt: typeof generatedAt === "string" ? generatedAt : generatedAt ? String(generatedAt) : null,
        payload: row.payload,
      };
    });
    return predictionsFromReports(records);
  } catch (err) {
    console.error("[daily-prices] report read failed:", err instanceof Error ? err.message.slice(0, 120) : "failed");
    return [];
  }
}
