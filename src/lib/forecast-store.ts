import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  appendRecord,
  parseForecastLog,
  serialiseForecastLog,
  verifyChain,
  type ChainRecord,
  type ForecastBody,
  type OutcomeBody,
} from "@/lib/forecast-chain";
import { scorecardFromLog, type ForecastScorecard } from "@/lib/forecast-scorecard";

export const DEFAULT_FORECAST_LOG_PATH = path.join(process.cwd(), "data", "forecast-log.jsonl");

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function forecastLogPath(): string {
  const override = (process.env.FORECAST_LOG_PATH || "").trim();
  return override || DEFAULT_FORECAST_LOG_PATH;
}

export function readForecastLog(file = forecastLogPath()): { records: ChainRecord[]; error: string | null } {
  try {
    const text = readFileSync(file, "utf8");
    return parseForecastLog(text);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") return { records: [], error: null };
    return { records: [], error: "The log file could not be read." };
  }
}

export function publicScorecard(file = forecastLogPath()): ForecastScorecard {
  return scorecardFromLog(readForecastLog(file));
}

export function forecastLogText(file = forecastLogPath()): string {
  const parsed = readForecastLog(file);
  if (parsed.error || !verifyChain(parsed.records).ok) return "";
  return serialiseForecastLog(parsed.records);
}

function writeRecords(file: string, records: ChainRecord[]) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, serialiseForecastLog(records), "utf8");
}

/**
 * Append forecasts, then append outcomes for earlier forecasts whose 7-day
 * horizon has passed and whose later price was supplied. Existing lines are
 * not rewritten. A broken chain is left untouched.
 */
export function commitForecasts(input: {
  file?: string;
  forecasts: ForecastBody[];
  nowMs: number;
  prices?: Record<string, number>;
}): { appended: number; resolved: number; ok: boolean } {
  const file = input.file || forecastLogPath();
  try {
    const parsed = readForecastLog(file);
    if (parsed.error || !verifyChain(parsed.records).ok) return { appended: 0, resolved: 0, ok: false };
    const records = parsed.records.slice();
    const seen = new Set(records.filter((row) => row.kind === "forecast").map((row) => row.id));
    let appended = 0;
    for (const body of input.forecasts) {
      if (seen.has(body.id)) continue;
      if (!(body.price_at_issue > 0)) continue;
      if (body.stance !== "directional" && body.stance !== "no-edge") continue;
      records.push(appendRecord(records, body));
      seen.add(body.id);
      appended += 1;
    }
    const resolved = appendDueOutcomes(records, input.nowMs, input.prices || {});
    if (appended || resolved) writeRecords(file, records);
    return { appended, resolved, ok: verifyChain(records).ok };
  } catch (err) {
    console.error("[forecast-log] append failed:", err instanceof Error ? err.message.slice(0, 160) : "failed");
    return { appended: 0, resolved: 0, ok: false };
  }
}

function appendDueOutcomes(records: ChainRecord[], nowMs: number, prices: Record<string, number>): number {
  const done = new Set(records.filter((row) => row.kind === "outcome").map((row) => row.forecast_id));
  let added = 0;
  const forecasts = records.filter((row) => row.kind === "forecast");
  for (const forecast of forecasts) {
    if (done.has(forecast.id)) continue;
    const issued = Date.parse(forecast.ts_utc);
    if (!Number.isFinite(issued) || nowMs - issued < WEEK_MS) continue;
    const later = prices[forecast.ticker.toUpperCase()];
    if (!(later > 0) || !(forecast.price_at_issue > 0)) continue;
    const actualReturn = ((later - forecast.price_at_issue) / forecast.price_at_issue) * 100;
    const outcome: OutcomeBody = {
      kind: "outcome",
      id: `outcome:${forecast.id}`,
      forecast_id: forecast.id,
      ts_utc: new Date(nowMs).toISOString(),
      actual_return_pct: Math.round(actualReturn * 10000) / 10000,
      actual_up: later > forecast.price_at_issue,
      price_at_outcome: later,
      source_label: forecast.source_label,
    };
    records.push(appendRecord(records, outcome));
    done.add(forecast.id);
    added += 1;
  }
  return added;
}
