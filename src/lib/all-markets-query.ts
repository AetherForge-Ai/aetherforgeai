import type { Exchange } from "@/lib/market-intel";

const VALID: Exchange[] = ["NZX", "ASX", "DOW", "NASDAQ"];

/** Missing exchange opens on NZX. Anything else that is not a share board is rejected. */
export function parseAllMarketsExchange(
  raw: string | null | undefined,
): { ok: true; exchange: Exchange } | { ok: false } {
  const value = (raw || "").trim().toUpperCase();
  if (!value) return { ok: true, exchange: "NZX" };
  if (VALID.includes(value as Exchange)) return { ok: true, exchange: value as Exchange };
  return { ok: false };
}
