import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/session";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { MarketsAppFrame } from "@/components/dashboard/MarketsAppFrame";
import { StockAssetPage } from "@/components/dashboard/StockAssetPage";
import { exchangeFromTicker, normalizeStockTicker, parseExchange } from "@/lib/market-detail-routes";

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

  return (
    <MarketsAppFrame user={user}>
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
