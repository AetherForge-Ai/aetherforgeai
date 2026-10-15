import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/session";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { MarketsAppFrame } from "@/components/dashboard/MarketsAppFrame";
import { StockAssetPage } from "@/components/dashboard/StockAssetPage";
import { StockPublicFacts } from "@/components/markets/StockPublicFacts";
import { exchangeFromTicker, exchangeLabel, normalizeStockTicker, parseStockBoard } from "@/lib/market-detail-routes";
import { MARKET_UNIVERSE } from "@/lib/market-intel";
import { loadStockQuoteLine } from "@/lib/public-market-index";
import { findListing, isSitemapStock } from "@/lib/stock-catalog";
import { listingSentence, usPageShouldNoindex } from "@/lib/stock-markets";
import { fetchYahooHistories } from "@/lib/yahoo-finance";
import { stockContentParagraphs, stockPageIndexable } from "@/lib/stock-page-content";

export const dynamic = "force-dynamic";

/** The document price. A slow quote must not hold the company name or the facts. */
async function StockQuoteLine({ ticker }: { ticker: string }) {
  const quoteLine = await loadStockQuoteLine(ticker, 800);
  return (
    <p className="text-sm text-muted-foreground" data-ticker-quote>
      {quoteLine ?? `${ticker} Price not in this response.`}
    </p>
  );
}

function currencyFor(ticker: string): string {
  return ticker.endsWith(".NZ") ? "NZD" : ticker.endsWith(".AX") ? "AUD" : "USD";
}

async function loadAboutParagraphs(ticker: string, name: string, symbol: string, sector: string, exchangeLabel: string) {
  const histories = await fetchYahooHistories({ [ticker]: ticker }, "3mo").catch(() => ({} as Record<string, number[]>));
  return stockContentParagraphs({ name, symbol, sector, exchangeLabel, currency: currencyFor(ticker), closes: histories[ticker] ?? [] });
}

/** H-13: server-rendered text from real closes only. */
async function StockAbout(props: { ticker: string; name: string; symbol: string; sector: string; exchangeLabel: string }) {
  const paragraphs = await loadAboutParagraphs(props.ticker, props.name, props.symbol, props.sector, props.exchangeLabel);
  return (
    <section className="space-y-3 text-sm leading-relaxed text-muted-foreground" aria-label={`About ${props.name}`} data-stock-about>
      <h2 className="font-display text-lg font-bold text-foreground">About {props.name} on the {props.exchangeLabel}</h2>
      {paragraphs.map((text, i) => (
        <p key={i}>{text}</p>
      ))}
    </section>
  );
}

function QuoteLineSkeleton() {
  return (
    <p className="h-5 w-56 animate-pulse rounded bg-muted/60 text-sm text-muted-foreground" data-ticker-quote-loading aria-busy="true">
      <span className="sr-only">Loading the price…</span>
    </p>
  );
}

function FactsSkeleton() {
  return (
    <section
      className="space-y-3 rounded-2xl border border-border/70 bg-card p-4 shadow-sm"
      aria-label="Listing facts"
      aria-busy="true"
      data-stock-facts-loading
    >
      <div className="h-4 w-40 animate-pulse rounded bg-muted/60" />
      <div className="h-4 w-56 animate-pulse rounded bg-muted/60" />
      <div className="h-20 w-full max-w-md animate-pulse rounded bg-muted/60" />
      <span className="sr-only">Loading listing facts…</span>
    </section>
  );
}

function listingFor(ticker: string) {
  const catalog = findListing(ticker);
  const universe = MARKET_UNIVERSE.find((row) => row.ticker.toUpperCase() === ticker.toUpperCase());
  const entry = catalog
    ? { name: catalog.name, sector: catalog.sector || universe?.sector || "Not stated", ticker: catalog.ticker }
    : universe
      ? { name: universe.name, sector: universe.sector, ticker: universe.ticker }
      : undefined;
  const board = catalog?.board ?? exchangeFromTicker(ticker);
  return { entry, exchangeLabel: board ? exchangeLabel(board) : "", board };
}

function stockPageIndexingEnabled(): boolean {
  return process.env.STOCK_PAGE_INDEXING === "1";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ticker: string }>;
}): Promise<Metadata> {
  const { ticker } = await params;
  const symbolKey = normalizeStockTicker(ticker) ?? decodeURIComponent(ticker);
  const { entry, exchangeLabel, board } = listingFor(symbolKey);
  const symbol = symbolKey.replace(/\.(NZ|AX|L)$/i, "");
  if (!entry) {
    return {
      ...publicPageMetadata(`/markets/stock/${ticker}`, {
        title: `${symbolKey} · Stock · AetherForge AI`,
        description: `${symbolKey} on AetherForge markets. Paper research, not a broker.`,
      }),
      robots: { index: false, follow: true },
    };
  }
  const inSitemap = isSitemapStock(entry.ticker);
  const needsQuoteCheck = (board === "NASDAQ" || board === "NYSE") && !inSitemap;
  const hasQuote = needsQuoteCheck ? !!(await loadStockQuoteLine(entry.ticker)) : false;
  const meta = publicPageMetadata(`/markets/stock/${ticker}`, {
    title: `${entry.name} (${symbol}) · ${exchangeLabel} · AetherForge AI`,
    description: `${listingSentence(entry.name, entry.sector, exchangeLabel)} Symbol ${symbol}. The price is shown when this response has one. Paper research, not a broker.`,
  });
  // H-13: a stock page is a price card plus a listing line, well under 300
  // words of unique text, so it is not indexed until the long-form summary
  // ships. STOCK_PAGE_INDEXING=1 turns indexing back on for sitemap names.
  const thin =
    !stockPageIndexingEnabled() ||
    !stockPageIndexable(await loadAboutParagraphs(entry.ticker, entry.name, symbol, entry.sector || "", exchangeLabel));
  if (thin || usPageShouldNoindex({ board, inSitemap, hasQuote })) {
    return { ...meta, robots: { index: false, follow: true } };
  }
  return meta;
}

/**
 * /markets/stock/[ticker] — shareable equity page.
 * [ticker] is the internal symbol /api/stock-detail already accepts (FPH.NZ, BHP.AX, AAPL).
 * The name, exchange and sector come from the list in the repo. The price comes from the feed.
 */
export default async function StockDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ ticker: string }>;
  searchParams: Promise<{ buy?: string; exchange?: string }>;
}) {
  const { ticker: raw } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  const ticker = normalizeStockTicker(raw);
  const exchange = (ticker ? exchangeFromTicker(ticker) : null) ?? parseStockBoard(sp.exchange);
  const symbol = ticker ? ticker.replace(/\.(NZ|AX|L)$/i, "") : "";
  const allowBuy = !!user && sp.buy === "1";
  const listing = ticker ? listingFor(ticker) : { entry: undefined, exchangeLabel: "" };
  const addHref = ticker ? `/markets/stock/${encodeURIComponent(ticker)}?buy=1` : "/register";

  return (
    <MarketsAppFrame user={user}>
      {user ? (
        /* Signed in: the card below carries the visible header. The h1 stays in the HTML for structure. */
        <section className="mx-auto w-full max-w-6xl px-4 pt-6 sm:px-6 lg:px-8" data-stock-listing>
          <h1 className="sr-only">{listing.entry?.name || ticker || "Stock"}</h1>
          {!allowBuy && ticker ? (
            <Link href={addHref} className="inline-block text-sm font-semibold text-primary underline-offset-2 hover:underline">
              Add to your paper book
            </Link>
          ) : null}
        </section>
      ) : (
        <section className="mx-auto w-full max-w-6xl space-y-3 px-4 pt-6 sm:px-6 lg:px-8" data-stock-listing>
          <h1 className="font-display text-2xl font-bold text-foreground">{listing.entry?.name || ticker || "Stock"}</h1>
          {listing.entry ? (
            <p className="text-sm text-muted-foreground">
              {listingSentence(listing.entry.name, listing.entry.sector, listing.exchangeLabel)}{" "}
              {symbol} · {listing.exchangeLabel}.
            </p>
          ) : null}
          {ticker ? (
            <Suspense fallback={<QuoteLineSkeleton />}>
              <StockQuoteLine ticker={ticker} />
            </Suspense>
          ) : (
            <p className="text-sm text-muted-foreground" data-ticker-quote>
              Price not in this response.
            </p>
          )}
          {ticker ? (
            <Suspense fallback={<FactsSkeleton />}>
              <StockPublicFacts
                ticker={ticker}
                symbol={symbol}
                sector={listing.entry?.sector || ""}
                companyName={listing.entry?.name || ""}
              />
            </Suspense>
          ) : null}
          {ticker && listing.entry ? (
            <Suspense fallback={null}>
              <StockAbout
                ticker={ticker}
                name={listing.entry.name}
                symbol={symbol}
                sector={listing.entry.sector || ""}
                exchangeLabel={listing.exchangeLabel}
              />
            </Suspense>
          ) : null}
          <Link href="/register" className="inline-block text-sm font-semibold text-primary underline-offset-2 hover:underline">
            Create a free account
          </Link>
        </section>
      )}
      <StockAssetPage
        ticker={ticker ?? ""}
        symbol={symbol}
        exchange={exchange}
        allowBuy={allowBuy}
        unavailable={!ticker}
      />
    </MarketsAppFrame>
  );
}
