import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { MarketsAppFrame } from "@/components/dashboard/MarketsAppFrame";
import { StockAssetPage } from "@/components/dashboard/StockAssetPage";
import { exchangeFromTicker, exchangeLabel, normalizeStockTicker, parseStockBoard } from "@/lib/market-detail-routes";
import { MARKET_UNIVERSE } from "@/lib/market-intel";
import { loadStockQuoteLine } from "@/lib/public-market-index";
import { findListing } from "@/lib/stock-catalog";

export const dynamic = "force-dynamic";

function listingFor(ticker: string) {
  const catalog = findListing(ticker);
  const universe = MARKET_UNIVERSE.find((row) => row.ticker.toUpperCase() === ticker.toUpperCase());
  const entry = catalog
    ? { name: catalog.name, sector: catalog.sector || universe?.sector || "Not stated", ticker: catalog.ticker }
    : universe
      ? { name: universe.name, sector: universe.sector, ticker: universe.ticker }
      : undefined;
  const board = catalog?.board ?? exchangeFromTicker(ticker);
  return { entry, exchangeLabel: board ? exchangeLabel(board) : "" };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ticker: string }>;
}): Promise<Metadata> {
  const { ticker } = await params;
  const symbolKey = normalizeStockTicker(ticker) ?? decodeURIComponent(ticker);
  const { entry, exchangeLabel } = listingFor(symbolKey);
  const symbol = symbolKey.replace(/\.(NZ|AX|L)$/i, "");
  if (!entry) {
    return publicPageMetadata(`/markets/stock/${ticker}`, {
      title: `${symbolKey} · Stock · AetherForge AI`,
      description: `${symbolKey} on AetherForge markets. Paper research, not a broker.`,
    });
  }
  return publicPageMetadata(`/markets/stock/${ticker}`, {
    title: `${entry.name} (${symbol}) · ${exchangeLabel} · AetherForge AI`,
    description: `${entry.name} is in the ${entry.sector} list on ${exchangeLabel}. The price is shown when this response has one. Paper research, not a broker.`,
  });
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
  const quoteLine = ticker ? await loadStockQuoteLine(ticker) : null;
  const addHref = ticker ? `/markets/stock/${encodeURIComponent(ticker)}?buy=1` : "/register";

  return (
    <MarketsAppFrame user={user}>
      <section className="mx-auto w-full max-w-6xl space-y-2 px-4 pt-6 sm:px-6 lg:px-8" data-stock-listing>
        {listing.entry ? (
          <>
            <h1 className="font-display text-2xl font-bold">{listing.entry.name}</h1>
            <p className="text-sm text-muted-foreground">
              {listing.entry.name} is in the {listing.entry.sector} list on {listing.exchangeLabel}.{" "}
              {symbol} · {listing.exchangeLabel}.
            </p>
          </>
        ) : (
          <h1 className="font-display text-2xl font-bold">{ticker || "Stock"}</h1>
        )}
        <p className="text-sm text-muted-foreground" data-ticker-quote>
          {quoteLine ?? (ticker ? `${ticker} Price not in this response.` : "Price not in this response.")}
        </p>
        {user ? (
          <Link href={addHref} className="inline-block text-sm font-semibold text-primary underline-offset-2 hover:underline">
            Add to your paper book
          </Link>
        ) : (
          <Link href="/register" className="inline-block text-sm font-semibold text-primary underline-offset-2 hover:underline">
            Create a free account
          </Link>
        )}
      </section>
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
