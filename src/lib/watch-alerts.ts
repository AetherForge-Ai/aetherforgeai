/**
 * Goal b10 G-04: Alerts v1 (price level, % move, holding news, ex-dividend).
 *
 * Watches live in the existing `price_alert` table. The row's `instructions`
 * carries `[WATCH:{json}]` so the sell-trigger desk ignores it. Notices are
 * in-app only: nothing is emailed (outbound email needs Lukas's approval).
 */
import type { WatchAlert, WatchKind } from "@/lib/holding-alert";

export const WATCH_PREFIX = "[WATCH:";
export const WATCH_KINDS: readonly WatchKind[] = ["price_level", "percent_move", "news", "ex_dividend"];
export const WATCH_POLL_MS = 60_000;

export interface WatchSpec {
  kind: WatchKind;
  level?: number | null;
  side?: "above" | "below";
  movePct?: number | null;
  exDate?: string | null;
}

export function isWatchRow(instructions: unknown): boolean {
  return typeof instructions === "string" && instructions.startsWith(WATCH_PREFIX);
}

export function encodeWatch(spec: WatchSpec): string {
  return `${WATCH_PREFIX}${JSON.stringify(spec)}]`;
}

export function decodeWatch(instructions: unknown): WatchSpec | null {
  if (!isWatchRow(instructions)) return null;
  const body = String(instructions).slice(WATCH_PREFIX.length, -1);
  try {
    const spec = JSON.parse(body) as WatchSpec;
    return WATCH_KINDS.includes(spec.kind) ? spec : null;
  } catch {
    return null;
  }
}

export function watchSpecError(spec: Partial<WatchSpec>): string | null {
  if (!spec.kind || !WATCH_KINDS.includes(spec.kind)) return "Pick an alert type.";
  if (spec.kind === "price_level") {
    if (!(Number(spec.level) > 0)) return "Enter a price level above 0.";
    if (spec.side !== "above" && spec.side !== "below") return "Choose above or below.";
  }
  if (spec.kind === "percent_move" && !(Number(spec.movePct) > 0 && Number(spec.movePct) <= 100)) {
    return "Enter a % move between 0 and 100.";
  }
  if (spec.kind === "ex_dividend" && !/^\d{4}-\d{2}-\d{2}$/.test(String(spec.exDate || ""))) {
    return "Enter the ex-dividend date.";
  }
  return null;
}

export function rowToWatch(row: { _id?: string; ticker?: string; status?: string; instructions?: string }, headline?: string | null): WatchAlert | null {
  const spec = decodeWatch(row.instructions);
  if (!spec || !row._id || !row.ticker) return null;
  return {
    id: String(row._id),
    ticker: String(row.ticker).toUpperCase(),
    kind: spec.kind,
    status: row.status === "paused" ? "paused" : "active",
    level: spec.level ?? null,
    side: spec.side,
    movePct: spec.movePct ?? null,
    exDate: spec.exDate ?? null,
    headline: headline ?? null,
  };
}

const KIND_LABEL: Record<WatchKind, string> = {
  price_level: "Price level",
  percent_move: "% move",
  news: "Holding news",
  ex_dividend: "Ex-dividend date",
};

export function watchKindLabel(kind: WatchKind): string {
  return KIND_LABEL[kind];
}
