"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { tickerLiveLabel } from "@/lib/ticker-feed";
import { PUBLIC_PRICE_QUIET } from "@/lib/data-sources";
import { cn } from "@/lib/utils";
import { formatDisplayDate, formatMoney, formatSignedPercent } from "@/lib/currency";
import { formatTapeItem, fxRateLine, type TapeDisplay } from "@/lib/tape-display";
import { useFxRates } from "@/hooks/useFxRates";
import { savedSnapshotLabel } from "@/lib/status-feeds";
import { cryptoFreshnessLabel, exchangeFreshnessLabel, latestQuoteTime, metalUpdatedPhrase } from "@/lib/market-freshness";
import { cryptoVenueForLabel } from "@/lib/crypto-price-chain";
import { priceBadge } from "@/lib/price-confidence";
import { forcedRefreshMisses, type FeedForce } from "@/lib/feed-freshness-hook";

/**
 * Market tape. Prices come only from GET /api/ticker (one live pipeline).
 * Until that response arrives the band shows no numbers and no LIVE label.
 * A failed or empty read stays unlabeled — it does not fall back to a demo book.
 */

interface Quote {
  symbol: string;
  name: string;
  price: number;
  change: number | null;
  currency?: string;
  provider?: string;
  asOf?: string;
  quotedAt?: string | null;
}

const VENUES = {
  nzx: "https://www.nzx.com/markets/NZSX",
  asx: "https://www.asx.com.au/markets/company/TLX",
};

function formatPrice(q: Quote, display: TapeDisplay, rates: { USD: number; AUD: number; NZD: number }): string {
  return formatTapeItem(q, display, rates);
}

function formatAsOf(iso: string | null | undefined): string {
  if (!iso) return "";
  const wall = formatDisplayDate(iso);
  return wall === "—" ? "" : wall;
}

/** Goal b10 G-05: weekend and holiday closes stay green while the feed answers. */
const TAPE_FRESH_MS = 4 * 24 * 60 * 60 * 1000;
const TAPE_AMBER_MS = 7 * 24 * 60 * 60 * 1000;

function TickerCell({
  q,
  price,
  source,
  delay,
  failedRefreshes,
}: {
  q: Quote;
  price: string;
  source: string;
  delay: string;
  failedRefreshes: number;
}) {
  const hasChange = q.change != null && Number.isFinite(q.change);
  const flat = hasChange && Number(q.change.toFixed(2)) === 0;
  const up = hasChange && !flat && q.change > 0;
  const asOf = formatAsOf(q.quotedAt);
  // b38 H-1: a crypto price whose own quote is over 15 min old says "delayed" on the tape. Equity
  // rows already carry the exchange delay wording, so they are not marked twice.
  const quotedMs = q.quotedAt ? Date.parse(q.quotedAt) : NaN;
  const rowDelayed = !/delayed/i.test(delay) && Number.isFinite(quotedMs) && Date.now() - quotedMs > TAPE_ROW_DELAYED_MS;
  // Goal b10 G-05: per-price badge. Amber after one missed refresh, red after two.
  const badge = priceBadge({
    source,
    delay,
    quotedAt: q.quotedAt ? new Date(q.quotedAt) : null,
    refreshOk: failedRefreshes === 0,
    failedRefreshes,
    // A last close over a weekend or holiday is still the latest print; the
    // tape already says Close. Tone follows missed refreshes first.
    freshMs: TAPE_FRESH_MS,
    amberMs: TAPE_AMBER_MS,
  });
  return (
    <span className="inline-flex items-center gap-2 px-4 py-0.5 whitespace-nowrap">
      <span className="font-display text-[0.78rem] font-semibold tracking-tight text-emerald-300">
        {q.symbol}
      </span>
      <span
        data-price-tone={badge.tone}
        role="img"
        aria-label={`Price ${badge.tone}: ${badge.source}. ${badge.delay}.${badge.why ? ` ${badge.why}` : ""}${asOf ? ` As of ${asOf}.` : ""}`}
        title={`${badge.source} · ${badge.delay}${asOf ? ` · as of ${asOf}` : ""}${badge.why ? ` · ${badge.why}` : ""}`}
        className={cn(
          "inline-block h-1.5 w-1.5 rounded-full",
          badge.tone === "green" ? "bg-emerald-400" : badge.tone === "amber" ? "bg-amber-400" : "bg-rose-500"
        )}
      />
      <span className="tnum text-[0.78rem] text-zinc-100">{price}</span>
      <span
        className={cn(
          "tnum inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[0.7rem] font-semibold",
          !hasChange || flat ? "bg-zinc-800 text-zinc-300" : up ? "bg-emerald-500/20 text-gain" : "bg-rose-500/20 text-rose-300"
        )}
      >
        <span aria-hidden="true">{!hasChange || flat ? "·" : up ? "▲" : "▼"}</span>
        {q.change == null ? "—" : formatSignedPercent(q.change)}
        {asOf ? <span className="ml-1 font-medium normal-case">as of {asOf}</span> : null}
        {rowDelayed ? <span className="ml-1 rounded bg-amber-500/20 px-1 font-semibold text-amber-300" data-tape-delayed>delayed</span> : null}
      </span>
    </span>
  );
}

/** b38 H-1: per-row delayed marker threshold (Chief ruling: 15 min). */
const TAPE_ROW_DELAYED_MS = 15 * 60 * 1000;

function TickerRow({
  quotes,
  animationClass,
  label,
  live,
  status,
  priceFor,
  source,
  delay,
  failedRefreshes,
  missesFor,
  emptyText,
}: {
  quotes: Quote[];
  animationClass: string;
  label: string;
  live: boolean;
  status?: string;
  priceFor: (q: Quote) => string;
  source: string;
  delay: string;
  failedRefreshes: number;
  /** Per-quote override. Used when one row mixes feeds. */
  missesFor?: (q: Quote) => number;
  emptyText?: string;
}) {
  // A chip with no price (e.g. "BTC" alone) is left out rather than shown as a bare symbol.
  quotes = quotes.filter((q) => Number.isFinite(q.price) && q.price > 0);
  return (
    <div className="relative flex items-center overflow-hidden border-b border-emerald-500/20 bg-zinc-950">
      <span className="z-10 inline-flex shrink-0 items-center gap-1.5 border-r border-emerald-500/20 bg-zinc-950 px-3 py-1.5 font-display text-[0.62rem] font-bold uppercase tracking-[0.18em] text-emerald-300 backdrop-blur">
        {label}
        {live ? (
          <span className="rounded bg-emerald-500/20 px-1 py-px text-[0.55rem] tracking-wide text-emerald-300">
            Live
          </span>
        ) : status ? (
          <span className="max-w-[14rem] truncate text-[0.55rem] font-medium normal-case tracking-normal text-zinc-300">
            {status}
          </span>
        ) : null}
      </span>
      <div className="relative flex-1 overflow-hidden">
        {quotes.length ? (
          <>
          {/* Screen readers get one plain list; both moving copies are hidden from them. */}
          <ul className="sr-only" aria-label={label}>
            {quotes.map((q, i) => (
              <li key={`sr-${q.symbol}-${i}`}>
                {q.symbol} {priceFor(q)} {q.change == null ? "" : formatSignedPercent(q.change)}
              </li>
            ))}
          </ul>
          <div className={cn("ticker-row flex w-max items-center", animationClass)} aria-hidden="true">
            {/* Two equal copies, each with a lead gap the width of the edge fade, so the first item is never under it and the -50% loop stays seamless. */}
            {[0, 1].map((copy) => (
              <div key={copy} className="flex shrink-0 items-center pl-10" data-ticker-copy={copy} aria-hidden="true">
                {quotes.map((q, i) => {
                  const cryptoCell = (q.currency || "").toUpperCase() === "USD" && !q.symbol.includes(".");
                  return (
                    <TickerCell
                      key={`${q.symbol}-${copy}-${i}`}
                      q={q}
                      price={priceFor(q)}
                      source={cryptoCell ? q.provider || source : source}
                      delay={cryptoCell ? "Delayed or indicative" : delay}
                      failedRefreshes={missesFor ? missesFor(q) : failedRefreshes}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          </>
        ) : (
          <span className="px-4 text-[0.72rem] text-muted-foreground">{emptyText ?? PUBLIC_PRICE_QUIET}</span>
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
  quotedAt?: string | null;
}

function MetalsSpotBanner({ initial = null }: { initial?: MetalsSpotFeed | null }) {
  const seeded = initial?.live && initial.quotedAt ? initial : null;
  const [spot, setSpot] = useState<MetalsSpotFeed | null>(seeded);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await api.get<MetalsSpotFeed>("/api/metals/spot");
      if (active && res.ok && res.data?.gold && res.data.silver) {
        setSpot(res.data);
        console.log("[metals-banner] Spot loaded:", res.data.live ? "spot" : "est", res.data);
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
            spot?.live ? "bg-emerald-500/15 text-gain" : "bg-muted text-muted-foreground"
          )}
          title={spot?.live ? "Spot price" : "Estimated price"}
        >
          {!spot
            ? failed
              ? "Failed"
              : "…"
            : spot.live
              ? metalUpdatedPhrase(spot.quotedAt) ?? "Spot"
              : "Est."}
        </span>
      </div>
    </div>
  );
}

interface MarketTickerProps {
  className?: string;
  /** Show all three banner rows (home) or a single compact row (dashboard). */
  compact?: boolean;
  /** Server-rendered tape so the first HTML can include prices. */
  initial?: TickerFeed | null;
  /** Server-rendered metals spot. Baseline prices are not passed in. */
  initialMetals?: MetalsSpotFeed | null;
}

interface TickerFeed {
  rows: { nzx: Quote[]; asx: Quote[]; crypto: Quote[] };
  live: { crypto: boolean; equities: boolean };
  providers?: { equities: string | null; crypto: string | null };
  asOf?: string | null;
  /** Present only for an allow-listed test account. */
  testFeedForce?: FeedForce | null;
}

const EMPTY_LIVE = { crypto: false, equities: false };

function hasTape(feed: TickerFeed | null | undefined): boolean {
  if (!feed?.rows) return false;
  return feed.rows.nzx.length + feed.rows.asx.length + feed.rows.crypto.length > 0;
}

export function MarketTicker({ className, compact = false, initial = null, initialMetals = null }: MarketTickerProps) {
  const [nzx, setNzx] = useState<Quote[]>(initial?.rows.nzx ?? []);
  const [asx, setAsx] = useState<Quote[]>(initial?.rows.asx ?? []);
  const [crypto, setCrypto] = useState<Quote[]>(initial?.rows.crypto ?? []);
  const [live, setLive] = useState(initial?.live ?? EMPTY_LIVE);
  const [providers, setProviders] = useState<{ equities: string | null; crypto: string | null }>({
    equities: initial?.providers?.equities ?? null,
    crypto: initial?.providers?.crypto ?? null,
  });
  const [asOf, setAsOf] = useState<string | null>(initial?.asOf ?? null);
  const [loaded, setLoaded] = useState(hasTape(initial));
  // b38 (Chief ruling 2): the server has no snapshot at all yet (503): a friendly loading line.
  const [pricesWarming, setPricesWarming] = useState(false);
  const onMarketsPage = (usePathname() || "").startsWith("/markets");
  const [failedRefreshes, setFailedRefreshes] = useState(0);
  const [feedForce, setFeedForce] = useState<FeedForce | null>(null);
  const [showNzd, setShowNzd] = useState(false);
  const fx = useFxRates();
  const fxReady = fx.ready && !!fx.asOf;
  const display: TapeDisplay = showNzd && fxReady ? "NZD" : "native";
  const priceFor = (q: Quote) => formatPrice(q, display, fx.rates);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const loadFeed = async () => {
      if (retry) {
        clearTimeout(retry);
        retry = null;
      }
      // b31 G-05/REG-1: a stalled feed gives up after 4 s; the last-good rows stay (amber
      // after one missed refresh) and the next tick, or a quick retry, recovers.
      const timeout = AbortSignal.timeout(4_000);
      const anySignal = (AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }).any;
      const signal = anySignal ? anySignal([controller.signal, timeout]) : timeout;
      const res = await api.get<TickerFeed>("/api/ticker", { signal });
      // Unmount only. A res.aborted from the 4 s timeout counts as a missed refresh (amber, retry).
      if (!active || controller.signal.aborted) return;
      const rows = res.ok ? res.data?.rows : null;
      const hasRows = !!rows && (rows.nzx?.length || 0) + (rows.asx?.length || 0) + (rows.crypto?.length || 0) > 0;
      if (res.ok && rows && hasRows) {
        // An empty part keeps its last-good rows rather than blanking.
        if (rows.nzx?.length) setNzx(rows.nzx);
        if (rows.asx?.length) setAsx(rows.asx);
        if (rows.crypto?.length) setCrypto(rows.crypto);
        setLive(res.data!.live ?? EMPTY_LIVE);
        setProviders(res.data!.providers ?? { equities: null, crypto: null });
        setAsOf(res.data!.asOf ?? null);
        setFeedForce(res.data!.testFeedForce ?? null);
        setFailedRefreshes(0);
        setPricesWarming(false);
      } else {
        const warming = !res.ok && res.status === 503;
        setPricesWarming(warming);
        setFailedRefreshes((count) => count + 1);
        // b40: an aborted or timed-out poll (navigation, the tab sleeping, a slow edge) is routine and retried;
        // log it quietly instead of as a console error. The visible state already says "Retrying shortly".
        const reason = res.ok ? "no rows" : String(res.error ?? "");
        if (/abort|timeout|timed out|network/i.test(reason) || res.status === 503) console.info("[ticker] Feed poll retrying:", reason || res.status);
        else console.warn("[ticker] Feed fetch failed:", reason);
        retry = setTimeout(loadFeed, warming ? 5_000 : 15_000);
      }
      setLoaded(true);
    };
    loadFeed();
    const id = setInterval(loadFeed, 60_000);
    return () => {
      active = false;
      clearInterval(id);
      if (retry) clearTimeout(retry);
      controller.abort();
    };
  }, []);

  const liveTape = tickerLiveLabel({ live, rows: { crypto } });
  const nzxStatus = exchangeFreshnessLabel("NZX").label;
  const asxStatus = exchangeFreshnessLabel("ASX").label;
  const cryptoStatus = cryptoFreshnessLabel(latestQuoteTime(crypto.map((row) => row.quotedAt)));
  const asOfLabel = formatAsOf(asOf);
  // b37 M-2: one "Prices last updated" line on the signed-in strip, from the newest quote time shown
  // (equity as-of or crypto), so the strip no longer mixes "Close · 16 Oct" with "as of 19 Oct".
  const pricesUpdatedAt = latestQuoteTime([asOf, ...crypto.map((row) => row.quotedAt)]);
  const providerLabel = [
    providers.equities ? `Equities ${providers.equities}` : null,
    providers.crypto ? `Crypto ${providers.crypto}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const statusTitle = [liveTape, providerLabel, asOfLabel ? `as of ${asOfLabel}` : null]
    .filter(Boolean)
    .join(" · ");
  const equityMisses = forcedRefreshMisses(feedForce, "equity", failedRefreshes);
  const cryptoMisses = forcedRefreshMisses(feedForce, "crypto", failedRefreshes);
  const equityDelay = "Delayed, not a direct NZX or ASX feed";
  const equitySource = providers.equities || "Public market data (Yahoo Finance)";
  const feedBadge = priceBadge({
    source: equitySource,
    delay: equityDelay,
    quotedAt: asOf ? new Date(asOf) : null,
    refreshOk: equityMisses === 0,
    failedRefreshes: equityMisses,
  });

  // H-4/M-1: no short placeholder. The same rows render while loading so the
  // page below does not move when prices arrive (CLS).
  const anyRows = nzx.length + asx.length + crypto.length > 0;
  const emptyText = loaded
    ? anyRows
      ? undefined
      : pricesWarming
        ? "Prices loading… back in a few seconds."
        : "Prices are delayed. Retrying shortly."
    : "Loading prices…";
  if (compact) {
    const blend = [...nzx.slice(0, 6), ...asx.slice(0, 5), ...crypto.slice(0, 5)];
    return (
      <div className={cn("w-full border-y border-border/50", className)} title={statusTitle} data-market-ticker="compact" aria-busy={!loaded || undefined}>
        <TickerRow
          quotes={blend}
          animationClass="animate-ticker"
          label="Markets"
          live={false}
          status={nzxStatus}
          priceFor={priceFor}
          source={equitySource}
          delay={equityDelay}
          failedRefreshes={equityMisses}
          missesFor={(q) => {
            const cryptoCell = (q.currency || "").toUpperCase() === "USD" && !q.symbol.includes(".");
            return forcedRefreshMisses(feedForce, cryptoCell ? "crypto" : "equity", failedRefreshes);
          }}
          emptyText={emptyText}
        />
        {/* b40 CLS (/tax 0.14): the footer reserves two lines on narrow screens and carries the feed note
            inline, so text arriving after load ("Prices last updated …", the feed note) can't push the page down. */}
        <div className="flex min-h-[2.75rem] flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-zinc-950 px-3 py-1 text-[0.6rem] text-muted-foreground sm:min-h-[1.75rem]">
          {loaded && feedBadge.tone !== "green" ? <span className="text-[0.6rem]">{feedBadge.why}</span> : null}
          <button
            type="button"
            className="rounded border border-emerald-500/30 px-2 py-0.5 font-semibold text-emerald-200 disabled:opacity-50"
            disabled={!fxReady}
            aria-pressed={display === "NZD"}
            onClick={() => setShowNzd((on) => !on)}
          >
            {display === "NZD" ? "Showing NZ$" : "Show NZ$"}
          </button>
          <span>{fxReady ? fxRateLine(fx.rates) : "Loading today's NZ$ exchange rate…"}</span>
          {/* b38 M-2: /markets shows its own single "Prices last updated" line; the tape does not repeat it. */}
          {onMarketsPage ? null : <span data-prices-last-updated>{pricesUpdatedAt ? savedSnapshotLabel(pricesUpdatedAt.toISOString()) : "Prices last updated: loading…"}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("w-full", className)} data-market-ticker="full" aria-busy={!loaded || undefined}>
      <TickerRow
        quotes={nzx}
        animationClass="animate-ticker"
        label="NZX 50"
        live={false}
        status={nzxStatus}
        priceFor={priceFor}
        source={equitySource}
        delay={equityDelay}
        failedRefreshes={equityMisses}
        emptyText={emptyText}
      />
      <TickerRow
        quotes={asx}
        animationClass="animate-ticker-reverse"
        label="ASX 200"
        live={false}
        status={asxStatus}
        priceFor={priceFor}
        source={equitySource}
        delay={equityDelay}
        failedRefreshes={equityMisses}
        emptyText={emptyText}
      />
      <TickerRow
        quotes={crypto}
        animationClass="animate-ticker-slow"
        label="Crypto"
        live={false}
        status={cryptoStatus.label}
        priceFor={priceFor}
        source={providers.crypto || "Public crypto prices"}
        delay="Delayed or indicative"
        failedRefreshes={cryptoMisses}
        emptyText={emptyText}
      />
      {loaded && feedBadge.tone !== "green" ? (
        <p className="border-b border-emerald-500/20 bg-zinc-950 px-3 py-1 text-[0.65rem] text-muted-foreground">{feedBadge.why}</p>
      ) : null}
      <MetalsSpotBanner initial={initialMetals} />
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-b border-emerald-500/20 bg-zinc-950 px-3 py-1.5 text-[0.6rem] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className={cn("size-1.5 rounded-full", liveTape ? "bg-emerald-400" : "bg-muted-foreground/50")} />
          {cryptoStatus.live ? cryptoStatus.label : nzx.length || asx.length ? nzxStatus : "Quiet"}
        </span>
        {providerLabel ? <span>{providerLabel}</span> : null}
        <a href={VENUES.nzx} target="_blank" rel="noopener noreferrer" className="hover:text-foreground hover:underline">
          NZX
        </a>
        <a href={VENUES.asx} target="_blank" rel="noopener noreferrer" className="hover:text-foreground hover:underline">
          ASX
        </a>
        {cryptoVenueForLabel(providers.crypto).href ? (
          <a href={cryptoVenueForLabel(providers.crypto).href} target="_blank" rel="noopener noreferrer" className="hover:text-foreground hover:underline">
            {cryptoVenueForLabel(providers.crypto).label}
          </a>
        ) : (
          <span>{cryptoVenueForLabel(providers.crypto).label}</span>
        )}
        <button
          type="button"
          className="rounded border border-emerald-500/30 px-2 py-0.5 font-semibold text-emerald-200 hover:text-white disabled:opacity-50"
          disabled={!fxReady}
          aria-pressed={display === "NZD"}
          onClick={() => setShowNzd((on) => !on)}
        >
          {display === "NZD" ? "Showing NZ$" : "Show NZ$"}
        </button>
        <span>{fxReady ? fxRateLine(fx.rates) : "Loading today's NZ$ exchange rate…"}</span>
      </div>
    </div>
  );
}

export default MarketTicker;
