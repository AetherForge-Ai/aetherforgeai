/**
 * Extra CoinPaprika fields the ticker list often leaves out.
 * A missing figure stays blank. Nothing here is filled in by hand.
 */

import { chainFromPaprikaCoin, type PaprikaChainInput } from "@/lib/crypto-board";
import type { CoinChart } from "@/lib/crypto-market";
import type { CoinMarket } from "@/lib/crypto-market";

function num(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export function paprikaCoinNeedsFill(coin: Pick<CoinMarket, "blockchain" | "high24h" | "low24h" | "circulatingSupply" | "atl" | "sparkline7d">): boolean {
  const chain = (coin.blockchain || "").trim();
  const chainMissing = !chain || chain === "—" || chain === "Unavailable" || chain === "Native";
  const spark = coin.sparkline7d || [];
  return chainMissing || coin.high24h == null || coin.low24h == null || coin.circulatingSupply == null || coin.atl == null || spark.length < 2;
}

export function chainFromPaprikaDoc(body: unknown): string {
  const row = asRecord(body);
  if (!row) return "";
  const contracts = Array.isArray(row.contracts)
    ? row.contracts.map((item) => {
        const rec = asRecord(item);
        return {
          platform: typeof rec?.platform === "string" ? rec.platform : "",
          contract: typeof rec?.contract === "string" ? rec.contract : "",
        };
      })
    : [];
  const input: PaprikaChainInput = {
    type: typeof row.type === "string" ? row.type : "",
    symbol: typeof row.symbol === "string" ? row.symbol : "",
    name: typeof row.name === "string" ? row.name : "",
    platform: typeof row.platform === "string" ? row.platform : "",
    contracts,
  };
  return chainFromPaprikaCoin(input);
}

/** Latest daily candle. High and low are that candle, not a guessed range. */
export function highLowFromPaprikaOhlcv(body: unknown): { high24h: number | null; low24h: number | null } {
  const list = Array.isArray(body) ? body : [];
  const row = asRecord(list[0]);
  if (!row) return { high24h: null, low24h: null };
  return { high24h: num(row.high), low24h: num(row.low) };
}

export function closesFromPaprikaHistory(body: unknown): number[] {
  if (!Array.isArray(body)) return [];
  const closes: number[] = [];
  for (const item of body) {
    const row = asRecord(item);
    const price = num(row?.price);
    if (price != null && price > 0) closes.push(price);
  }
  return closes;
}

export function tickerPatchFromPaprika(body: unknown): { circulatingSupply: number | null; atl: number | null; atlDate: string | null; name: string } {
  const row = asRecord(body);
  const quotes = row ? asRecord(row.quotes) : null;
  const usd = quotes ? asRecord(quotes.USD) : null;
  const circulating = num(row?.circulating_supply);
  return {
    circulatingSupply: circulating != null && circulating > 0 ? circulating : null,
    atl: num(usd?.atl_price),
    atlDate: typeof usd?.atl_date === "string" ? usd.atl_date : null,
    name: typeof row?.name === "string" ? row.name.trim() : "",
  };
}

export function chartFromPaprikaHistory(body: unknown): CoinChart {
  const prices: CoinChart["prices"] = [];
  if (Array.isArray(body)) {
    for (const item of body) {
      const row = asRecord(item);
      const price = num(row?.price);
      const at = Date.parse(typeof row?.timestamp === "string" ? row.timestamp : "");
      if (price != null && price > 0 && Number.isFinite(at)) prices.push({ t: at, price });
    }
  }
  prices.sort((a, b) => a.t - b.t);
  return { prices, volumes: [] };
}

export interface PaprikaIndexRow {
  id: string;
  symbol: string;
}

export function indexPaprikaCoins(body: unknown): PaprikaIndexRow[] {
  if (!Array.isArray(body)) return [];
  const rows: PaprikaIndexRow[] = [];
  for (const item of body) {
    const row = asRecord(item);
    const id = typeof row?.id === "string" ? row.id.trim() : "";
    const symbol = typeof row?.symbol === "string" ? row.symbol.trim().toUpperCase() : "";
    if (id && symbol) rows.push({ id, symbol });
  }
  return rows;
}

async function defaultFetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(800),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function applyPatch(coin: CoinMarket, patch: Partial<CoinMarket>): CoinMarket {
  const next = { ...coin };
  const chain = (patch.blockchain || "").trim();
  const stored = (next.blockchain || "").trim();
  if (chain && (!stored || stored === "—" || stored === "Unavailable" || stored === "Native")) next.blockchain = chain;
  if (next.high24h == null && patch.high24h != null && patch.high24h > 0) next.high24h = patch.high24h;
  if (next.low24h == null && patch.low24h != null && patch.low24h > 0) next.low24h = patch.low24h;
  if (next.circulatingSupply == null && patch.circulatingSupply != null && patch.circulatingSupply > 0) {
    next.circulatingSupply = patch.circulatingSupply;
  }
  if (next.atl == null && patch.atl != null && patch.atl > 0) next.atl = patch.atl;
  if (!next.atlDate && patch.atlDate) next.atlDate = patch.atlDate;
  if ((!next.sparkline7d || next.sparkline7d.length < 2) && patch.sparkline7d && patch.sparkline7d.length > 1) {
    next.sparkline7d = patch.sparkline7d;
  }
  const name = (patch.name || "").trim();
  if (name && next.name.trim().toUpperCase() === next.symbol.toUpperCase() && name.toUpperCase() !== next.symbol.toUpperCase()) {
    next.name = name;
  }
  return next;
}

/**
 * Fills gaps from CoinPaprika coin, ticker, candle and history documents.
 * Stops when the time budget runs out. Fields the feed does not send stay null.
 */
export async function enrichPaprikaGaps(
  coins: CoinMarket[],
  opts?: {
    budgetMs?: number;
    fetchJson?: (url: string) => Promise<unknown | null>;
    now?: number;
    index?: PaprikaIndexRow[];
  }
): Promise<CoinMarket[]> {
  const budgetMs = opts?.budgetMs ?? 6_000;
  const fetchJson = opts?.fetchJson ?? defaultFetchJson;
  const started = opts?.now ?? Date.now();
  const deadline = started + budgetMs;
  const out = coins.map((coin) => ({ ...coin }));
  const targets = out.filter(paprikaCoinNeedsFill);
  if (!targets.length || Date.now() >= deadline) return out;

  let index = opts?.index;
  if (!index) {
    index = indexPaprikaCoins(await fetchJson("https://api.coinpaprika.com/v1/coins"));
  }
  const idBySymbol = new Map<string, string>();
  for (const row of index) {
    if (!idBySymbol.has(row.symbol)) idBySymbol.set(row.symbol, row.id);
  }

  const queue = targets.slice();
  const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (queue.length && Date.now() < deadline) {
      const coin = queue.shift();
      if (!coin) return;
      const paprikaId = coin.paprikaId || idBySymbol.get(coin.symbol.toUpperCase()) || "";
      if (!paprikaId) continue;
      const patch: Partial<CoinMarket> = {};
      const chainMissing = !(coin.blockchain || "").trim() || coin.blockchain === "—" || coin.blockchain === "Unavailable" || coin.blockchain === "Native";
      if (chainMissing && Date.now() < deadline) {
        patch.blockchain = chainFromPaprikaDoc(await fetchJson(`https://api.coinpaprika.com/v1/coins/${encodeURIComponent(paprikaId)}`));
      }
      if ((coin.high24h == null || coin.low24h == null) && Date.now() < deadline) {
        const candle = highLowFromPaprikaOhlcv(
          await fetchJson(`https://api.coinpaprika.com/v1/coins/${encodeURIComponent(paprikaId)}/ohlcv/latest`)
        );
        patch.high24h = candle.high24h;
        patch.low24h = candle.low24h;
      }
      if ((coin.circulatingSupply == null || coin.atl == null || coin.name.toUpperCase() === coin.symbol.toUpperCase()) && Date.now() < deadline) {
        const ticker = tickerPatchFromPaprika(
          await fetchJson(`https://api.coinpaprika.com/v1/tickers/${encodeURIComponent(paprikaId)}?quotes=USD`)
        );
        patch.circulatingSupply = ticker.circulatingSupply;
        patch.atl = ticker.atl;
        patch.atlDate = ticker.atlDate;
        patch.name = ticker.name;
      }
      if ((coin.sparkline7d || []).length < 2 && Date.now() < deadline) {
        const start = new Date(started - 8 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        patch.sparkline7d = closesFromPaprikaHistory(
          await fetchJson(
            `https://api.coinpaprika.com/v1/tickers/${encodeURIComponent(paprikaId)}/historical?start=${start}&interval=1d`
          )
        );
      }
      const next = applyPatch(coin, patch);
      const at = out.findIndex((row) => row.symbol === coin.symbol && row.id === coin.id);
      if (at >= 0) out[at] = next;
    }
  });
  await Promise.all(workers);
  return out;
}
