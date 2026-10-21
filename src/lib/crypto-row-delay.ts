/** b38 H-1: pure helpers (no server imports) shared by the snapshot store, /markets and tests. */
import type { CoinMarket } from "@/lib/crypto-market";

/** b38 H-1: after this age a partial list refreshes the coins it matches (Chief ruling: 10 min). */
export const CRYPTO_PARTIAL_REFRESH_AFTER_MS = 10 * 60 * 1000;
/** b38 H-1: a row whose own quote is older than this shows a visible "delayed" marker. */
export const CRYPTO_ROW_DELAYED_AFTER_MS = 15 * 60 * 1000;
/**
 * b49 (TT b48: one /markets crypto row 16 h old, never refreshing): a partial refresh kept every row it
 * did not match, so a coin no source returns any more aged forever. A row whose own quote lags the
 * list by more than this is dropped instead of carried.
 */
// H-1 (b57, TT health 22 Oct: list shrank 400 → 365 → 264): a 2 h drop window threw away the
// last good rows whenever CoinGecko page 2 kept failing. Carried rows keep a "delayed" label and
// are only dropped after a full day.
export const CRYPTO_ROW_DROP_AFTER_MS = 24 * 60 * 60 * 1000;
/** H-1: the shared list never holds more than this many coins. */
export const CRYPTO_LIST_CAP = 400;

/**
 * b38 H-1: refresh matching coins from a partial list; the rest keep their price AND their own
 * last-updated time (the list's previous time when a row had none). Null when nothing matched.
 */
export function mergeStaleCryptoList(
  existing: { at: string; coins: CoinMarket[] },
  incoming: CoinMarket[],
  at: string
): CoinMarket[] | null {
  // b41 H-1: per-row checks — a valid price, a readable (not future) quote time, and a coin the saved
  // list already knows (by id, else symbol). Rows that fail are skipped; the rest still refresh.
  const atMs = Date.parse(at);
  const rowOk = (c: CoinMarket) => {
    if (!(typeof c.price === "number" && Number.isFinite(c.price) && c.price > 0)) return false;
    if (c.quotedAt) {
      const t = Date.parse(c.quotedAt);
      if (!Number.isFinite(t) || (Number.isFinite(atMs) && t - atMs > 2 * 60 * 1000)) return false;
    }
    return true;
  };
  const ok = incoming.filter(rowOk);
  const byId = new Map(ok.filter((c) => c.id).map((c) => [String(c.id).toLowerCase(), c]));
  const bySymbol = new Map(ok.map((c) => [c.symbol.toUpperCase(), c]));
  let matched = 0;
  const rowAt = (c: CoinMarket) => Date.parse(c.quotedAt || existing.at || "");
  const mapped = existing.coins.map((coin) => {
    const fresh = (coin.id ? byId.get(String(coin.id).toLowerCase()) : undefined) ?? bySymbol.get(coin.symbol.toUpperCase());
    // Never replace a row with an older quote than it already has.
    if (fresh?.quotedAt && coin.quotedAt && Date.parse(fresh.quotedAt) < Date.parse(coin.quotedAt)) return coin;
    if (!fresh) return { ...coin, quotedAt: coin.quotedAt || existing.at || null };
    matched += 1;
    return {
      ...coin,
      price: fresh.price,
      change24h: Number.isFinite(fresh.change24h) ? fresh.change24h : coin.change24h,
      quotedAt: fresh.quotedAt || at,
      source: fresh.source || coin.source,
    };
  });
  // b49: unmatched rows far behind the new list are dropped, not carried (never refreshed otherwise).
  const coins = mapped.filter((c) => !(Number.isFinite(atMs) && Number.isFinite(rowAt(c)) && atMs - rowAt(c) > CRYPTO_ROW_DROP_AFTER_MS));
  return matched ? coins : null;
}

/** b49: drop rows whose own quote lags the newest row in the list by more than CRYPTO_ROW_DROP_AFTER_MS. */
export function dropLaggingRows<T extends { quotedAt?: string | null }>(rows: T[]): T[] {
  let newest = -Infinity;
  for (const r of rows) {
    const t = Date.parse(r.quotedAt || "");
    if (Number.isFinite(t) && t > newest) newest = t;
  }
  if (!Number.isFinite(newest)) return rows;
  return rows.filter((r) => {
    const t = Date.parse(r.quotedAt || "");
    return !Number.isFinite(t) || newest - t <= CRYPTO_ROW_DROP_AFTER_MS;
  });
}

/** b41 H-1: how many incoming rows pass the per-row checks against the saved list (for /status). */
export function countMergeableRows(existing: { coins: CoinMarket[] }, incoming: CoinMarket[]): number {
  const ids = new Set(existing.coins.map((c) => String(c.id || "").toLowerCase()).filter(Boolean));
  const syms = new Set(existing.coins.map((c) => c.symbol.toUpperCase()));
  return incoming.filter((c) => Number.isFinite(c.price) && c.price > 0 && (ids.has(String(c.id || "").toLowerCase()) || syms.has(c.symbol.toUpperCase()))).length;
}

/** b38 H-1: true when this row's own quote time is older than 15 minutes (or unknown). */
export function cryptoRowDelayed(quotedAt: string | null | undefined, now = Date.now()): boolean {
  const t = Date.parse(quotedAt || "");
  return !Number.isFinite(t) || now - t > CRYPTO_ROW_DELAYED_AFTER_MS;
}


/**
 * H-1 (b57): a verified but shorter list (e.g. CoinGecko page 1 only, page 2 rate-limited) refreshes
 * the rows it has and ADDS coins the saved list lacked; saved rows it does not return are kept with
 * their own quotedAt (so they show "delayed") instead of being dropped. Rows older than
 * CRYPTO_ROW_DROP_AFTER_MS are dropped. Sorted by rank, capped at CRYPTO_LIST_CAP.
 */
export function unionCryptoList(
  existing: { at: string; coins: CoinMarket[] },
  incoming: CoinMarket[],
  at: string,
  cap = CRYPTO_LIST_CAP
): CoinMarket[] {
  const atMs = Date.parse(at);
  const key = (c: CoinMarket) => (c.id ? `id:${String(c.id).toLowerCase()}` : `sym:${c.symbol.toUpperCase()}`);
  const fresh = incoming.filter((c) => typeof c.price === "number" && Number.isFinite(c.price) && c.price > 0);
  const out = new Map<string, CoinMarket>();
  const freshSyms = new Set(fresh.map((c) => c.symbol.toUpperCase()));
  for (const c of fresh) out.set(key(c), { ...c, quotedAt: c.quotedAt || at });
  for (const c of existing.coins) {
    const k = key(c);
    if (out.has(k)) {
      const f = out.get(k)!;
      if (f.quotedAt && c.quotedAt && Date.parse(f.quotedAt) < Date.parse(c.quotedAt)) out.set(k, c);
      continue;
    }
    if (!c.id && freshSyms.has(c.symbol.toUpperCase())) continue;
    const quotedAt = c.quotedAt || existing.at || null;
    const t = Date.parse(quotedAt || "");
    if (Number.isFinite(atMs) && Number.isFinite(t) && atMs - t > CRYPTO_ROW_DROP_AFTER_MS) continue;
    out.set(k, { ...c, quotedAt });
  }
  const rank = (c: CoinMarket) => (Number.isFinite(c.rank) && c.rank > 0 ? c.rank : Number.MAX_SAFE_INTEGER);
  return Array.from(out.values()).sort((a, b) => rank(a) - rank(b)).slice(0, cap);
}
