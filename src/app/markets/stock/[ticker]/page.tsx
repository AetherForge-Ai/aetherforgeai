import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/session";
import { MarketsAppFrame } from "@/components/dashboard/MarketsAppFrame";
import { StockAssetPage } from "@/components/dashboard/StockAssetPage";
import { exchangeFromTicker, normalizeStockTicker, parseExchange } from "@/lib/market-detail-routes";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Stock · Markets · AetherForge AI",
};

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
