"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { tickerLiveLabel } from "@/lib/ticker-feed";
import { cn } from "@/lib/utils";
import { formatFxAsOf, formatMoney } from "@/lib/currency";

/**
 * Market tape. Prices come only from GET /api/ticker (one live pipeline).
 * Until that response arrives the band shows no numbers and no LIVE label.
 * A failed or empty read stays unlabeled — it does not fall back to a demo book.
 */

interface Quote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  currency?: string;
  provider?: string;
  asOf?: string;
}

const VENUES = {
  nzx: "https://www.nzx.com/markets/NZSX",
  asx: "https://www.asx.com.au/markets/company/TLX",
  crypto: "https://www.coingecko.com/",
};

function formatPrice(q: Quote): string {
  if (q.price >= 1000) return q.price.toLocaleString("en-NZ", { maximumFractionDigits: 0 });
  if (q.price >= 1) return q.price.toFixed(2);
  return q.price.toFixed(q.price < 0.1 ? 4 : 3);
}

function formatAsOf(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-NZ", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
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
  live,
}: {
  quotes: Quote[];
  animationClass: string;
  label: string;
  live: boolean;
}) {
  const doubled = [...quotes, ...quotes];
  return (
    <div className="relative flex items-center overflow-hidden border-b border-emerald-500/20 bg-zinc-950">
      <span className="z-10 inline-flex shrink-0 items-center gap-1.5 border-r border-emerald-500/20 bg-zinc-950 px-3 py-1.5 font-display text-[0.62rem] font-bold uppercase tracking-[0.18em] text-emerald-300 backdrop-blur">
        {label}
        {live ? (
          <span className="rounded bg-emerald-500/20 px-1 py-px text-[0.55rem] tracking-wide text-emerald-300">
            Live
          </span>
        ) : null}
      </span>
      <div className="relative flex-1 overflow-hidden">
        {quotes.length ? (
          <div className={cn("ticker-row flex w-max items-center", animationClass)}>
            {doubled.map((q, i) => (
              <TickerCell key={`${q.symbol}-${i}`} q={q} />
            ))}
          </div>
        ) : (
          <span className="px-4 text-[0.72rem] text-muted-foreground">Prices unavailable</span>
        )}
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
  asOf?: string;
}

function MetalsSpotBanner() {
  const [spot, setSpot] = useState<MetalsSpotFeed | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await api.get<MetalsSpotFeed>("/api/metals/spot");
      if (active && res.ok && res.data?.gold && res.data.silver) {
        setSpot(res.data);
        console.log("[metals-banner] Spot loaded:", res.data.live ? "live" : "est", res.data);
      } else if (active) {
        setFailed(true);
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
                  {formatMoney(it.s.nzdPerOz, "NZD")}
                  <span className="text-muted-foreground">/oz</span>
                </span>
                <span className="tnum text-[0.68rem] text-muted-foreground">
                  {formatMoney(it.s.usdPerOz, "USD")}
                </span>
              </>
            ) : (
              <span className="text-[0.75rem] text-muted-foreground">
                {failed ? "Spot prices failed to load." : "Loading…"}
              </span>
            )}
          </span>
        ))}
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[0.58rem] font-bold uppercase tracking-wide",
            spot?.live ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground"
          )}
          title={spot?.asOf ? formatFxAsOf(spot.asOf) : spot?.live ? "Live spot price" : "Estimated (live feed unavailable)"}
        >
          {spot ? (spot.live ? "Live" : "Est.") : failed ? "Failed" : "…"}
          {spot?.asOf ? ` · ${formatFxAsOf(spot.asOf)}` : ""}
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
  providers?: { equities: string | null; crypto: string | null };
  asOf?: string | null;
}

const EMPTY_LIVE = { crypto: false, equities: false };

export function MarketTicker({ className, compact = false }: MarketTickerProps) {
  const [nzx, setNzx] = useState<Quote[]>([]);
  const [asx, setAsx] = useState<Quote[]>([]);
  const [crypto, setCrypto] = useState<Quote[]>([]);
  const [live, setLive] = useState(EMPTY_LIVE);
  const [providers, setProviders] = useState<{ equities: string | null; crypto: string | null }>({
    equities: null,
    crypto: null,
  });
  const [asOf, setAsOf] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    const loadFeed = async () => {
      const res = await api.get<TickerFeed>("/api/ticker");
      if (!active) return;
      if (res.ok && res.data?.rows) {
        setNzx(res.data.rows.nzx ?? []);
        setAsx(res.data.rows.asx ?? []);
        setCrypto(res.data.rows.crypto ?? []);
        setLive(res.data.live ?? EMPTY_LIVE);
        setProviders(res.data.providers ?? { equities: null, crypto: null });
        setAsOf(res.data.asOf ?? null);
        console.log("[ticker] Feed loaded:", res.data.live, res.data.providers, res.data.asOf);
      } else if (!res.ok) {
        setNzx([]);
        setAsx([]);
        setCrypto([]);
        setLive(EMPTY_LIVE);
        setProviders({ equities: null, crypto: null });
        setAsOf(null);
        console.error("[ticker] Feed fetch failed:", res.error);
      }
      setLoaded(true);
    };
    loadFeed();
    const id = setInterval(loadFeed, 60_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  const liveTape = tickerLiveLabel({ live });
  const asOfLabel = formatAsOf(asOf);
  const providerLabel = [
    providers.equities ? `Equities ${providers.equities}` : loaded ? "Equities unavailable" : null,
    providers.crypto ? `Crypto ${providers.crypto}` : loaded ? "Crypto unavailable" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const statusTitle = [liveTape, providerLabel, asOfLabel ? `as of ${asOfLabel}` : null]
    .filter(Boolean)
    .join(" · ");

  if (!loaded) {
    return (
      <div className={cn("w-full border-y border-emerald-500/20 bg-zinc-950", className)}>
        <p className="px-4 py-1.5 text-[0.72rem] text-muted-foreground">Loading market prices…</p>
      </div>
    );
  }

  if (compact) {
    const blend = [...nzx.slice(0, 6), ...asx.slice(0, 5), ...crypto.slice(0, 5)];
    return (
      <div className={cn("w-full border-y border-border/50", className)} title={statusTitle}>
        <TickerRow
          quotes={blend}
          animationClass="animate-ticker"
          label="Markets"
          live={liveTape === "LIVE"}
        />
      </div>
    );
  }

  return (
    <div className={cn("w-full", className)}>
      <TickerRow quotes={nzx} animationClass="animate-ticker" label="NZX 50" live={live.equities} />
      <TickerRow quotes={asx} animationClass="animate-ticker-reverse" label="ASX 200" live={live.equities} />
      <TickerRow quotes={crypto} animationClass="animate-ticker-slow" label="Crypto" live={live.crypto} />
      <MetalsSpotBanner />
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-b border-emerald-500/20 bg-zinc-950 px-3 py-1.5 text-[0.6rem] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className={cn("size-1.5 rounded-full", liveTape ? "bg-emerald-400" : "bg-muted-foreground/50")} />
          {liveTape ?? "Unavailable"}
          {asOfLabel ? ` · as of ${asOfLabel}` : ""}
        </span>
        {providerLabel ? <span>{providerLabel}</span> : null}
        <a href={VENUES.nzx} target="_blank" rel="noopener noreferrer" className="hover:text-foreground hover:underline">
          NZX
        </a>
        <a href={VENUES.asx} target="_blank" rel="noopener noreferrer" className="hover:text-foreground hover:underline">
          ASX
        </a>
        <a href={VENUES.crypto} target="_blank" rel="noopener noreferrer" className="hover:text-foreground hover:underline">
          CoinGecko
        </a>
      </div>
    </div>
  );
}

export default MarketTicker;
