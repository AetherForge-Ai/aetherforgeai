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

// NZX 50 constituents (prices in NZD) — seed, replaced live by Yahoo Finance.
const NZX: Quote[] = [
  { symbol: "AIR.NZ", name: "Air New Zealand", price: 0.445, change: -1.11 },
  { symbol: "FPH.NZ", name: "Fisher & Paykel Health", price: 40.35, change: 1.61 },
  { symbol: "MEL.NZ", name: "Meridian Energy", price: 5.7, change: 0.88 },
  { symbol: "SPK.NZ", name: "Spark New Zealand", price: 1.86, change: 0.27 },
  { symbol: "CEN.NZ", name: "Contact Energy", price: 9.35, change: 0.86 },
  { symbol: "MCY.NZ", name: "Mercury NZ", price: 6.9, change: 0.88 },
  { symbol: "AIA.NZ", name: "Auckland Airport", price: 8.67, change: 0.81 },
  { symbol: "EBO.NZ", name: "Ebos Group", price: 21.49, change: 2.43 },
  { symbol: "MFT.NZ", name: "Mainfreight", price: 64.29, change: 0.96 },
  { symbol: "RYM.NZ", name: "Ryman Healthcare", price: 2.21, change: 1.38 },
  { symbol: "IFT.NZ", name: "Infratil", price: 15.42, change: 1.98 },
  { symbol: "FBU.NZ", name: "Fletcher Building", price: 3.38, change: 0 },
];

// ASX heavyweights (prices in AUD) — seed, replaced live by Yahoo Finance.
const ASX: Quote[] = [
  { symbol: "TLX.AX", name: "Telix Pharmaceuticals", price: 17.38, change: 2.96 },
  { symbol: "BHP.AX", name: "BHP Group", price: 60.02, change: -0.79 },
  { symbol: "CBA.AX", name: "Commonwealth Bank", price: 164.66, change: -0.22 },
  { symbol: "CSL.AX", name: "CSL Limited", price: 124.23, change: 1.99 },
  { symbol: "NAB.AX", name: "National Australia Bank", price: 38.65, change: 0.21 },
  { symbol: "WBC.AX", name: "Westpac Banking", price: 35.29, change: -1.12 },
  { symbol: "WES.AX", name: "Wesfarmers", price: 89.04, change: 0.9 },
  { symbol: "MQG.AX", name: "Macquarie Group", price: 250.73, change: -0.37 },
  { symbol: "WOW.AX", name: "Woolworths Group", price: 39.37, change: -1.03 },
  { symbol: "FMG.AX", name: "Fortescue", price: 18.52, change: 0.87 },
  { symbol: "TLS.AX", name: "Telstra Group", price: 4.99, change: 0.2 },
];

// Cryptocurrencies (USD) — seed snapshot, replaced by live CoinGecko/Yahoo prices.
const CRYPTO: Quote[] = [
  { symbol: "BTC", name: "Bitcoin", price: 63031, change: -0.88 },
  { symbol: "ETH", name: "Ethereum", price: 1772.2, change: -0.67 },
  { symbol: "SOL", name: "Solana", price: 80.78, change: -0.81 },
  { symbol: "XRP", name: "XRP", price: 1.1452, change: -0.93 },
  { symbol: "BNB", name: "BNB", price: 582.2, change: -1.15 },
  { symbol: "ADA", name: "Cardano", price: 0.1842, change: -2.72 },
  { symbol: "DOGE", name: "Dogecoin", price: 0.07695, change: -1.01 },
  { symbol: "AVAX", name: "Avalanche", price: 6.94, change: 0.33 },
  { symbol: "LINK", name: "Chainlink", price: 7.949, change: -1.31 },
  { symbol: "DOT", name: "Polkadot", price: 0.868, change: -1.28 },
  { symbol: "LTC", name: "Litecoin", price: 44.9, change: -1.8 },
  { symbol: "MATIC", name: "Polygon (POL)", price: 0.0748, change: 0.6 },
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
      <span className="font-display text-[0.78rem] font-semibold tracking-tight text-emerald-300">
        {q.symbol}
      </span>
      <span className="tnum text-[0.78rem] text-zinc-100">{formatPrice(q)}</span>
      <span
        className={cn(
          "tnum inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[0.7rem] font-semibold",
          up ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"
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
    <div className="relative flex items-center overflow-hidden border-b border-emerald-500/20 bg-zinc-950">
      <span className="z-10 shrink-0 border-r border-emerald-500/20 bg-zinc-950 px-3 py-1.5 font-display text-[0.62rem] font-bold uppercase tracking-[0.18em] text-emerald-300 backdrop-blur">
        {label}
      </span>
      <div className="relative flex-1 overflow-hidden">
        <div className={cn("ticker-row flex w-max items-center", animationClass)}>
          {doubled.map((q, i) => (
            <TickerCell key={`${q.symbol}-${i}`} q={q} />
          ))}
        </div>
        {/* Edge fades */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-zinc-950 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-zinc-950 to-transparent" />
      </div>
    </div>
  );
}

interface MetalSpot {
  usdPerOz: number;
  nzdPerOz: number;
}
interface MetalsSpotFeed {
  gold: MetalSpot;
  silver: MetalSpot;
  live: boolean;
}

function fmtOz(nzd: number): string {
  return nzd.toLocaleString("en-NZ", { maximumFractionDigits: nzd >= 1000 ? 0 : 2 });
}

/**
 * MetalsSpotBanner — a dedicated bar shown directly beneath the Crypto row on
 * the home page, displaying the current-day Gold & Silver spot prices (NZD/oz,
 * with the global USD/oz benchmark). Pulls from the PUBLIC /api/metals/spot
 * endpoint so any visitor sees live precious-metal prices.
 */
function MetalsSpotBanner() {
  const [spot, setSpot] = useState<MetalsSpotFeed | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await api.get<MetalsSpotFeed>("/api/metals/spot");
      if (active && res.ok && res.data) {
        setSpot(res.data);
        console.log("[metals-banner] Spot loaded:", res.data.live ? "live" : "est", res.data);
      } else if (!res.ok) {
        console.error("[metals-banner] Spot fetch failed:", res.error);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const items: { key: string; name: string; dot: string; text: string; s?: MetalSpot }[] = [
    { key: "gold", name: "Gold", dot: "bg-[var(--gold,#f5b301)]", text: "text-[var(--gold,#f5b301)]", s: spot?.gold },
    { key: "silver", name: "Silver", dot: "bg-slate-300", text: "text-slate-200", s: spot?.silver },
  ];

  return (
    <div className="flex items-center overflow-hidden border-b border-emerald-500/20 bg-zinc-950">
      <span className="z-10 shrink-0 border-r border-emerald-500/20 bg-zinc-950 px-3 py-1.5 font-display text-[0.62rem] font-bold uppercase tracking-[0.18em] text-emerald-300 backdrop-blur">
        Metals
      </span>
      <div className="flex flex-1 flex-wrap items-center justify-center gap-x-8 gap-y-1 px-4 py-1.5">
        {items.map((it) => (
          <span key={it.key} className="inline-flex items-center gap-2 whitespace-nowrap">
            <span className={cn("size-2 rounded-full", it.dot)} aria-hidden="true" />
            <span className={cn("font-display text-[0.8rem] font-semibold tracking-tight", it.text)}>
              {it.name}
            </span>
            {it.s ? (
              <>
                <span className="tnum text-[0.8rem] font-medium text-zinc-100">
                  NZ${fmtOz(it.s.nzdPerOz)}
                  <span className="text-muted-foreground">/oz</span>
                </span>
                <span className="tnum text-[0.68rem] text-muted-foreground">
                  US${fmtOz(it.s.usdPerOz)}
                </span>
              </>
            ) : (
              <span className="text-[0.75rem] text-muted-foreground">Loading…</span>
            )}
          </span>
        ))}
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[0.58rem] font-bold uppercase tracking-wide",
            spot?.live ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground"
          )}
          title={spot?.live ? "Live spot price" : "Estimated (live feed unavailable)"}
        >
          {spot ? (spot.live ? "Live" : "Est.") : "…"}
        </span>
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

  // Pull current prices from the live feed on mount, then re-hydrate every 60s so
  // the tape tracks the real market (crypto + equities are live via Yahoo/CoinGecko).
  useEffect(() => {
    let active = true;
    const loadFeed = async () => {
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
    };
    loadFeed();
    const id = setInterval(loadFeed, 60_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  const drift = useMemo(
    () => (list: Quote[]) =>
      list.map((q) => {
        const step = (Math.random() - 0.5) * 0.0008; // ±0.08% per tick (cosmetic only; re-synced live every 60s)
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
      {/* Precious-metals spot bar — Gold & Silver, directly under Crypto. */}
      <MetalsSpotBanner />
      {/* Source attribution — where the tape's data is sourced from. */}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-b border-emerald-500/20 bg-zinc-950 px-3 py-1.5 text-[0.6rem] text-muted-foreground">
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
