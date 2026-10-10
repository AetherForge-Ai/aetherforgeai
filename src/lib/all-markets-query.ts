import { STOCK_BOARDS, type StockBoard } from "@/lib/stock-markets";

/** Missing exchange opens on NZX. Anything else that is not a share board is rejected. */
export function parseAllMarketsExchange(
  raw: string | null | undefined,
): { ok: true; exchange: StockBoard } | { ok: false } {
  const value = (raw || "").trim().toUpperCase();
  if (!value) return { ok: true, exchange: "NZX" };
  if (STOCK_BOARDS.includes(value as StockBoard)) return { ok: true, exchange: value as StockBoard };
  return { ok: false };
}

export function parseAllMarketsPage(raw: string | null | undefined): number {
  const page = Number(raw);
  if (!Number.isFinite(page) || page < 1) return 1;
  return Math.min(10_000, Math.floor(page));
}
