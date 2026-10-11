/**
 * Production probes for the crypto feeds.
 * The result is status, latency, size, row count, and an error class.
 * Response bodies and API keys are not returned and are not logged.
 *
 * pull-check:crypto-live-2026-10-11
 */

import "server-only";

import { coinGeckoEndpoint } from "@/lib/coingecko-auth";
import { parseMegafilterPage } from "@/lib/crypto-dex";

export const DIAGNOSTIC_ACCEPT = "application/json;version=20230302";

export interface ProbeResult {
  id: "coingecko" | "geckoterminal" | "kraken" | "coinbase";
  status: number | null;
  ms: number;
  bytes: number;
  rows: number;
  error: "429" | "403" | "timeout" | "parse" | null;
  /** Which CoinGecko path was called. Never the key. */
  mode?: "keyless" | "demo" | "pro";
}

export function probeErrorClass(input: {
  status: number | null;
  timedOut: boolean;
  parsed: boolean;
  httpOk: boolean;
}): ProbeResult["error"] {
  if (input.timedOut) return "timeout";
  if (input.status === 429 || input.status === 1015) return "429";
  if (input.status === 403) return "403";
  if (input.httpOk && !input.parsed) return "parse";
  return null;
}

async function probe(
  id: ProbeResult["id"],
  url: string,
  headers: Record<string, string>,
  countRows: (body: unknown) => number,
  mode?: ProbeResult["mode"]
): Promise<ProbeResult> {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
    });
    const text = await res.text();
    const httpOk = res.ok;
    let parsed = false;
    let rows = 0;
    if (httpOk) {
      try {
        rows = countRows(JSON.parse(text));
        parsed = true;
      } catch {
        parsed = false;
      }
    }
    return {
      id,
      status: res.status,
      ms: Date.now() - started,
      bytes: text.length,
      rows: parsed ? rows : 0,
      error: probeErrorClass({ status: res.status, timedOut: false, parsed: httpOk ? parsed : true, httpOk }),
      ...(mode ? { mode } : {}),
    };
  } catch (err) {
    const message = err instanceof Error ? err.name : "";
    const timedOut = message === "TimeoutError" || message === "AbortError";
    console.error(`[crypto-diagnostics] ${id} ${timedOut ? "timeout" : "failed"}`);
    return {
      id,
      status: null,
      ms: Date.now() - started,
      bytes: 0,
      rows: 0,
      error: timedOut ? "timeout" : null,
      ...(mode ? { mode } : {}),
    };
  }
}

export async function runCryptoDiagnostics(): Promise<{ ok: true; probes: ProbeResult[] }> {
  const cg = coinGeckoEndpoint();
  const probes = await Promise.all([
    probe(
      "coingecko",
      `${cg.base}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=false`,
      cg.headers,
      (body) => (Array.isArray(body) ? body.length : 0),
      cg.mode
    ),
    probe(
      "geckoterminal",
      "https://api.geckoterminal.com/api/v2/networks/trending_pools?include=base_token,quote_token&page=1",
      { accept: DIAGNOSTIC_ACCEPT },
      (body) => parseMegafilterPage(body).length
    ),
    probe(
      "kraken",
      "https://api.kraken.com/0/public/Ticker?pair=XBTUSD",
      { accept: "application/json" },
      (body) => {
        const result = body && typeof body === "object" ? (body as { result?: unknown }).result : null;
        return result && typeof result === "object" ? Object.keys(result as object).length : 0;
      }
    ),
    probe(
      "coinbase",
      "https://api.exchange.coinbase.com/products/BTC-USD/ticker",
      { accept: "application/json" },
      (body) => {
        const price = body && typeof body === "object" ? Number((body as { price?: unknown }).price) : NaN;
        return price > 0 ? 1 : 0;
      }
    ),
  ]);
  const key = (process.env.COINGECKO_API_KEY || "").trim();
  if (key && JSON.stringify(probes).includes(key)) {
    console.error("[crypto-diagnostics] result withheld");
    return { ok: true, probes: [] };
  }
  return { ok: true, probes };
}
