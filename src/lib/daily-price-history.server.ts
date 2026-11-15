import "server-only";

import { DAILY_PRICE_CLOSE } from "@/lib/schema/daily-price-history.schema";
import { flagOn } from "@/lib/schema/types";
import { totalumSdk } from "@/lib/totalum";
import {
  HISTORY_UNAVAILABLE,
  canonicalRow,
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

export async function readDailyPriceHistory(
  env: Record<string, string | undefined> = process.env
): Promise<{ ok: true; rows: DailyCloseRow[] } | { ok: false; reason: typeof HISTORY_UNAVAILABLE }> {
  if (!dailyPriceHistoryEnabled(env)) return { ok: false, reason: HISTORY_UNAVAILABLE };
  try {
    const res = await totalumSdk.crud.query(DAILY_PRICE_CLOSE.table, {
      _limit: 5000,
      _sort: { captured_at: "asc" },
    } as never);
    const raw = ((res as { data?: Array<Record<string, unknown>> })?.data || []);
    const grouped = new Map<string, DailyCloseRow[]>();
    for (const item of raw) {
      const row = asRow(item);
      if (!row) continue;
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
