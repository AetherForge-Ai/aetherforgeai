import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/session";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { MarketsAppFrame } from "@/components/dashboard/MarketsAppFrame";
import { StockAssetPage } from "@/components/dashboard/StockAssetPage";
import { exchangeFromTicker, normalizeStockTicker, parseExchange } from "@/lib/market-detail-routes";
import { loadStockQuoteLine } from "@/lib/public-market-index";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ticker: string }>;
}): Promise<Metadata> {
  const { ticker } = await params;
  const label = decodeURIComponent(ticker);
  return publicPageMetadata(`/markets/stock/${ticker}`, {
    title: `${label} · Stock · AetherForge AI`,
    description: `${label} on AetherForge markets. Paper research, not a broker.`,
  });
}

/**
 * /markets/stock/[ticker] — shareable equity page.
 * [ticker] is the internal symbol /api/stock-detail already accepts (FPH.NZ, BHP.AX, AAPL).
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
  const exchange = (ticker ? exchangeFromTicker(ticker) : null) ?? parseExchange(sp.exchange);
  const symbol = ticker ? ticker.replace(/\.(NZ|AX|L)$/i, "") : "";
  const allowBuy = !!user && sp.buy === "1";
  const quoteLine = ticker ? await loadStockQuoteLine(ticker) : null;

  return (
    <MarketsAppFrame user={user}>
      <p className="mx-auto w-full max-w-6xl px-4 pt-6 text-sm text-muted-foreground sm:px-6 lg:px-8" data-ticker-quote>
        {quoteLine ?? (ticker ? `${ticker} Price not in this response.` : "Price not in this response.")}
      </p>
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
