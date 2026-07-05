"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * MarketTicker — several banner rows "flicking through" current market share
 * prices, scrolling in alternating directions. Three rows sourced from:
 *   • NZX 50   → nzx.com/markets/NZSX
 *   • ASX 200  → asx.com.au/markets/company/TLX
 *   • Crypto   → cmcmarkets.com/en-nz/lp/cryptocurrencies
 *
 * On mount it pulls current prices from `/api/ticker` (crypto is live via
 * CoinGecko; equities live when a market-data key is set) and then drifts them
 * gently on the client so the tape keeps animating between refreshes. A curated
 * snapshot seeds the rows so the banner is never empty before the fetch lands.
 */

interface Quote {
  symbol: string;
  name: string;
  price: number;
  change: number; // percent
  currency?: string;
}

const SOURCES = {
  nzx: "https://www.nzx.com/markets/NZSX",
  asx: "https://www.asx.com.au/markets/company/TLX",
  crypto: "https://www.cmcmarkets.com/en-nz/lp/cryptocurrencies",
};

// NZX 50 constituents (prices in NZD).
const NZX: Quote[] = [
  { symbol: "AIR.NZ", name: "Air New Zealand", price: 0.68, change: 1.49 },
  { symbol: "FPH.NZ", name: "Fisher & Paykel Health", price: 36.8, change: 0.82 },
  { symbol: "MEL.NZ", name: "Meridian Energy", price: 6.15, change: -0.64 },
  { symbol: "SPK.NZ", name: "Spark New Zealand", price: 4.2, change: -1.18 },
  { symbol: "CEN.NZ", name: "Contact Energy", price: 9.34, change: 0.43 },
  { symbol: "MCY.NZ", name: "Mercury NZ", price: 6.02, change: 0.21 },
  { symbol: "AIA.NZ", name: "Auckland Airport", price: 7.58, change: 1.07 },
  { symbol: "EBO.NZ", name: "Ebos Group", price: 37.15, change: -0.35 },
  { symbol: "MFT.NZ", name: "Mainfreight", price: 68.4, change: 1.72 },
  { symbol: "RYM.NZ", name: "Ryman Healthcare", price: 3.28, change: -1.44 },
  { symbol: "IFT.NZ", name: "Infratil", price: 10.86, change: 0.66 },
  { symbol: "FBU.NZ", name: "Fletcher Building", price: 2.94, change: 2.08 },
];

// ASX heavyweights (prices in AUD).
const ASX: Quote[] = [
  { symbol: "TLX.AX", name: "Telix Pharmaceuticals", price: 26.4, change: 1.82 },
  { symbol: "BHP.AX", name: "BHP Group", price: 40.12, change: 0.94 },
  { symbol: "CBA.AX", name: "Commonwealth Bank", price: 158.7, change: -0.52 },
  { symbol: "CSL.AX", name: "CSL Limited", price: 236.5, change: 1.31 },
  { symbol: "NAB.AX", name: "National Australia Bank", price: 38.9, change: -0.28 },
  { symbol: "WBC.AX", name: "Westpac Banking", price: 33.44, change: 0.61 },
  { symbol: "WES.AX", name: "Wesfarmers", price: 75.2, change: 0.88 },
  { symbol: "MQG.AX", name: "Macquarie Group", price: 224.6, change: -0.73 },
  { symbol: "WOW.AX", name: "Woolworths Group", price: 30.15, change: 0.35 },
  { symbol: "FMG.AX", name: "Fortescue", price: 19.06, change: -1.62 },
  { symbol: "TLS.AX", name: "Telstra Group", price: 4.05, change: 0.5 },
];

// Cryptocurrencies (USD) — seed snapshot, replaced by live CoinGecko prices.
const CRYPTO: Quote[] = [
  { symbol: "BTC", name: "Bitcoin", price: 96850, change: 2.14 },
  { symbol: "ETH", name: "Ethereum", price: 3420, change: 1.58 },
  { symbol: "SOL", name: "Solana", price: 198.4, change: 3.42 },
  { symbol: "XRP", name: "XRP", price: 2.31, change: -1.05 },
  { symbol: "BNB", name: "BNB", price: 612, change: 0.74 },
  { symbol: "ADA", name: "Cardano", price: 0.92, change: -0.66 },
  { symbol: "DOGE", name: "Dogecoin", price: 0.38, change: 4.12 },
  { symbol: "AVAX", name: "Avalanche", price: 41.2, change: 1.9 },
  { symbol: "LINK", name: "Chainlink", price: 22.8, change: 2.35 },
  { symbol: "DOT", name: "Polkadot", price: 8.4, change: -0.42 },
  { symbol: "LTC", name: "Litecoin", price: 108.5, change: 0.58 },
  { symbol: "MATIC", name: "Polygon", price: 0.62, change: 1.14 },
];

function formatPrice(q: Quote): string {
  if (q.price >= 1000) return q.price.toLocaleString("en-NZ", { maximumFractionDigits: 0 });
  if (q.price >= 10) return q.price.toFixed(2);
  if (q.price >= 1) return q.price.toFixed(2);
  return q.price.toFixed(q.price < 0.1 ? 4 : 3);
}

function TickerCell({ q }: { q: Quote }) {
  const up = q.change >= 0;
  return (
    <span className="inline-flex items-center gap-2 px-4 py-0.5 whitespace-nowrap">
      <span className="font-display text-[0.78rem] font-semibold tracking-tight text-foreground/90">
        {q.symbol}
      </span>
      <span className="tnum text-[0.78rem] text-muted-foreground">{formatPrice(q)}</span>
      <span
        className={cn(
          "tnum inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[0.7rem] font-semibold",
          up ? "bg-primary/12 text-primary" : "bg-destructive/15 text-destructive"
        )}
      >
        <span aria-hidden="true">{up ? "▲" : "▼"}</span>
        {up ? "+" : ""}
        {q.change.toFixed(2)}%
      </span>
    </span>
  );
}

function TickerRow({
  quotes,
  animationClass,
  label,
}: {
  quotes: Quote[];
  animationClass: string;
  label: string;
}) {
  // Duplicate the row so the -50% translate loops seamlessly.
  const doubled = [...quotes, ...quotes];
  return (
    <div className="relative flex items-center overflow-hidden border-b border-border/40 bg-card/40">
      <span className="z-10 shrink-0 border-r border-border/50 bg-background/80 px-3 py-1.5 font-display text-[0.62rem] font-bold uppercase tracking-[0.18em] text-primary/80 backdrop-blur">
        {label}
      </span>
      <div className="relative flex-1 overflow-hidden">
        <div className={cn("ticker-row flex w-max items-center", animationClass)}>
          {doubled.map((q, i) => (
            <TickerCell key={`${q.symbol}-${i}`} q={q} />
          ))}
        </div>
        {/* Edge fades */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-card/80 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-card/80 to-transparent" />
      </div>
    </div>
  );
}

interface MarketTickerProps {
  className?: string;
  /** Show all three banner rows (home) or a single compact row (dashboard). */
  compact?: boolean;
}

interface TickerFeed {
  rows: { nzx: Quote[]; asx: Quote[]; crypto: Quote[] };
  live: { crypto: boolean; equities: boolean };
}

export function MarketTicker({ className, compact = false }: MarketTickerProps) {
  // Seed from the snapshot, then hydrate from /api/ticker and drift on an
  // interval so the tape keeps feeling live between refreshes.
  const [nzx, setNzx] = useState(NZX);
  const [asx, setAsx] = useState(ASX);
  const [crypto, setCrypto] = useState(CRYPTO);
  const [live, setLive] = useState<{ crypto: boolean; equities: boolean }>({ crypto: false, equities: false });

  // Pull current prices from the live feed on mount (crypto is always live).
  useEffect(() => {
    let active = true;
    (async () => {
      const res = await api.get<TickerFeed>("/api/ticker");
      if (active && res.ok && res.data?.rows) {
        setNzx(res.data.rows.nzx?.length ? res.data.rows.nzx : NZX);
        setAsx(res.data.rows.asx?.length ? res.data.rows.asx : ASX);
        setCrypto(res.data.rows.crypto?.length ? res.data.rows.crypto : CRYPTO);
        setLive(res.data.live ?? { crypto: false, equities: false });
        console.log("[ticker] Live feed loaded:", res.data.live);
      } else if (!res.ok) {
        console.error("[ticker] Feed fetch failed, using snapshot:", res.error);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const drift = useMemo(
    () => (list: Quote[]) =>
      list.map((q) => {
        const step = (Math.random() - 0.5) * 0.0025; // ±0.25% per tick
        const nextPrice = Math.max(0.0001, q.price * (1 + step));
        const nextChange = q.change + step * 100;
        return { ...q, price: nextPrice, change: nextChange };
      }),
    []
  );

  useEffect(() => {
    const id = setInterval(() => {
      setNzx((l) => drift(l));
      setAsx((l) => drift(l));
      setCrypto((l) => drift(l));
    }, 3200);
    return () => clearInterval(id);
  }, [drift]);

  if (compact) {
    // Dashboard: a single dense NZX+ASX+crypto blend row.
    const blend = [...nzx.slice(0, 6), ...asx.slice(0, 5), ...crypto.slice(0, 5)];
    return (
      <div className={cn("w-full border-y border-border/50", className)}>
        <TickerRow quotes={blend} animationClass="animate-ticker" label="Live Markets" />
      </div>
    );
  }

  return (
    <div className={cn("w-full", className)}>
      <TickerRow quotes={nzx} animationClass="animate-ticker" label="NZX 50" />
      <TickerRow quotes={asx} animationClass="animate-ticker-reverse" label="ASX 200" />
      <TickerRow quotes={crypto} animationClass="animate-ticker-slow" label="Crypto" />
      {/* Source attribution — where the tape's data is sourced from. */}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-b border-border/40 bg-background/60 px-3 py-1.5 text-[0.6rem] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className={cn("size-1.5 rounded-full", live.crypto ? "bg-emerald-400" : "bg-muted-foreground/50")} />
          Data:
        </span>
        <a href={SOURCES.nzx} target="_blank" rel="noopener noreferrer" className="hover:text-foreground hover:underline">
          NZX 50
        </a>
        <a href={SOURCES.asx} target="_blank" rel="noopener noreferrer" className="hover:text-foreground hover:underline">
          ASX 200
        </a>
        <a href={SOURCES.crypto} target="_blank" rel="noopener noreferrer" className="hover:text-foreground hover:underline">
          CMC Markets · Crypto
        </a>
        <span className="text-muted-foreground/70">
          {live.crypto ? "Crypto live" : "Snapshot"}
          {live.equities ? " · Equities live" : ""}
        </span>
      </div>
    </div>
  );
}

export default MarketTicker;
