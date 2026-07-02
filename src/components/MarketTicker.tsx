"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * MarketTicker — several banner rows "flicking through" current market share
 * prices, scrolling in alternating directions. NZ-first (NZX + ASX) plus the
 * major global indices and digital assets, so the home page and dashboard feel
 * live. Prices seed from a curated snapshot and drift gently on the client so
 * the tape animates without any external market-data key.
 */

interface Quote {
  symbol: string;
  name: string;
  price: number;
  change: number; // percent
  currency?: string;
}

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

// Global indices, majors & digital assets (USD).
const GLOBAL: Quote[] = [
  { symbol: "BTC", name: "Bitcoin", price: 96850, change: 2.14 },
  { symbol: "ETH", name: "Ethereum", price: 3420, change: 1.58 },
  { symbol: "SOL", name: "Solana", price: 198.4, change: 3.42 },
  { symbol: "XRP", name: "XRP", price: 2.31, change: -1.05 },
  { symbol: "AAPL", name: "Apple", price: 229.87, change: 0.74 },
  { symbol: "NVDA", name: "NVIDIA", price: 131.26, change: 2.61 },
  { symbol: "MSFT", name: "Microsoft", price: 441.58, change: -0.44 },
  { symbol: "TSLA", name: "Tesla", price: 342.68, change: 1.88 },
  { symbol: "NZD/USD", name: "Kiwi Dollar", price: 0.601, change: -0.22 },
  { symbol: "AUD/USD", name: "Aussie Dollar", price: 0.655, change: 0.14 },
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

export function MarketTicker({ className, compact = false }: MarketTickerProps) {
  // Seed once, then drift on an interval so the tape feels live.
  const [nzx, setNzx] = useState(NZX);
  const [asx, setAsx] = useState(ASX);
  const [global, setGlobal] = useState(GLOBAL);

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
      setGlobal((l) => drift(l));
    }, 3200);
    return () => clearInterval(id);
  }, [drift]);

  if (compact) {
    // Dashboard: a single dense NZX+ASX+global blend row.
    const blend = [...NZX.slice(0, 6), ...ASX.slice(0, 5), ...GLOBAL.slice(0, 5)];
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
      <TickerRow quotes={global} animationClass="animate-ticker-slow" label="Global · Crypto" />
    </div>
  );
}

export default MarketTicker;
