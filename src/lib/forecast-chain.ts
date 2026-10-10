import { createHash } from "node:crypto";

/** Previous hash of the first line. The log starts with no lines. */
export const FORECAST_GENESIS = "0".repeat(64);

export type ForecastStance = "directional" | "no-edge";

export interface ForecastBody {
  kind: "forecast";
  id: string;
  ts_utc: string;
  bot: "stox" | "koins";
  ticker: string;
  horizon: "7d";
  stance: ForecastStance;
  direction: "up" | "down" | null;
  /** Realised frequency shown at issue time. Null when none was shown. */
  p_up: number | null;
  fit_band: string | null;
  inputs_summary: string;
  drivers: string[];
  source_label: string;
  delay_label: string;
  price_at_issue: number;
  naive_up: boolean | null;
  model_version: string;
  features_hash: string;
}

export interface OutcomeBody {
  kind: "outcome";
  id: string;
  forecast_id: string;
  ts_utc: string;
  actual_return_pct: number;
  actual_up: boolean;
  price_at_outcome: number;
  source_label: string;
}

export type ChainBody = ForecastBody | OutcomeBody;

export type ChainRecord = ChainBody & {
  prev_hash: string;
  hash: string;
};

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src).sort()) {
      if (key === "hash") continue;
      const child = src[key];
      if (child === undefined) continue;
      out[key] = sortValue(child);
    }
    return out;
  }
  return value;
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function entryHash(prevHash: string, body: object): string {
  return sha256Hex(prevHash + canonicalJson(body));
}

export function parseForecastLog(text: string): { records: ChainRecord[]; error: string | null } {
  const records: ChainRecord[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      const parsed = JSON.parse(line) as ChainRecord;
      if (!parsed || typeof parsed.hash !== "string" || typeof parsed.prev_hash !== "string" || !parsed.kind) {
        return { records, error: `Line ${i + 1} is not a log record.` };
      }
      records.push(parsed);
    } catch {
      return { records, error: `Line ${i + 1} is not JSON.` };
    }
  }
  return { records, error: null };
}

export function verifyChain(records: ChainRecord[]): { ok: true } | { ok: false; index: number; reason: string } {
  let prev = FORECAST_GENESIS;
  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    if (rec.prev_hash !== prev) return { ok: false, index: i, reason: "prev_hash" };
    const { hash: _hash, ...body } = rec;
    if (entryHash(prev, body) !== rec.hash) return { ok: false, index: i, reason: "hash" };
    prev = rec.hash;
  }
  return { ok: true };
}

export function appendRecord(records: ChainRecord[], body: ChainBody): ChainRecord {
  const prev = records.length ? records[records.length - 1].hash : FORECAST_GENESIS;
  const next = { ...body, prev_hash: prev };
  return { ...next, hash: entryHash(prev, next) };
}

export function serialiseForecastLog(records: ChainRecord[]): string {
  if (!records.length) return "";
  return `${records.map((row) => JSON.stringify(row)).join("\n")}\n`;
}
