import { isExchangeRegularSession } from "@/lib/market-intel";

export type NzsxMover = {
  symbol: string;
  name: string;
  changePct: number;
};

export type NzsxBoardView = {
  indexName: string;
  level: number | null;
  changePct: number | null;
  breadth: { advancers: number; decliners: number; unchanged: number; total: number } | null;
  gainers: NzsxMover[];
  losers: NzsxMover[];
  /** Plain-language freshness. Not a separate label component. */
  freshness: string;
  universeNote: string;
};

const INDEX_NAME = "S&P/NZX 50";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function snapshotPayload(body: unknown): Record<string, unknown> | null {
  const root = asRecord(body);
  if (!root) return null;
  const data = asRecord(root.data);
  if (data && Array.isArray(data.exchanges)) return data;
  if (Array.isArray(root.exchanges)) return root;
  return null;
}

function movers(value: unknown): NzsxMover[] {
  if (!Array.isArray(value)) return [];
  const out: NzsxMover[] = [];
  for (const row of value) {
    const item = asRecord(row);
    if (!item) continue;
    const changePct = Number(item.changePct);
    const symbol = String(item.symbol || item.ticker || "").trim();
    if (!symbol || !Number.isFinite(changePct)) continue;
    out.push({
      symbol,
      name: String(item.name || symbol),
      changePct,
    });
  }
  return out;
}

function aucklandStamp(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/**
 * S&P/NZX 50 level, one NZX breadth universe, and movers from /api/market-snapshot.
 * Freshness is a sentence. It does not invent a live/delayed chip.
 */
export function presentNzsxBoard(body: unknown, now = new Date()): NzsxBoardView {
  const payload = snapshotPayload(body);
  const exchanges = Array.isArray(payload?.exchanges) ? payload.exchanges : [];
  const nzx = exchanges.map(asRecord).find((row) => row?.exchange === "NZX") ?? null;
  const index = asRecord(nzx?.index);
  const breadthRaw = asRecord(nzx?.breadth);
  const price = Number(index?.price);
  const change = Number(index?.changePct);
  const asOf = typeof payload?.asOf === "string" ? aucklandStamp(payload.asOf) : null;
  const inSession = isExchangeRegularSession("NZX", now);
  const freshness = !asOf
    ? "Quote time is not available. NZX figures may be delayed, or they may be the last close."
    : inSession
      ? `NZX is in its regular session. Latest quote ${asOf}. These figures can be delayed.`
      : `NZX is outside its regular session. Latest quote ${asOf}. Treat this as the last close we have.`;

  const breadth = breadthRaw
    ? {
        advancers: Number(breadthRaw.advancers) || 0,
        decliners: Number(breadthRaw.decliners) || 0,
        unchanged: Number(breadthRaw.unchanged) || 0,
        total: Number(breadthRaw.total) || 0,
      }
    : null;

  return {
    indexName: typeof index?.name === "string" && index.name.trim() ? index.name : INDEX_NAME,
    level: Number.isFinite(price) && price > 0 ? price : null,
    changePct: Number.isFinite(change) ? change : null,
    breadth,
    gainers: movers(nzx?.topGainers),
    losers: movers(nzx?.topLosers),
    freshness,
    universeNote:
      typeof nzx?.universeLabel === "string" && nzx.universeLabel.trim()
        ? nzx.universeLabel
        : "Breadth uses one universe: the NZX names in this snapshot.",
  };
}
