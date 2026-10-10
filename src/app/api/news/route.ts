import { NextResponse } from "next/server";
import { loadMarketNews } from "@/lib/market-news";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Headlines only. The market-news page uses this instead of GET /api/market,
 * which also returns the full quote universe.
 */
export async function GET() {
  const news = await loadMarketNews("stock");
  const headlines = news.map((item) => ({
    headline: item.headline,
    source: item.source,
    market: item.market,
    marketLabel: item.marketLabel,
    impact: item.impact,
    relevance: item.relevance,
    time: item.time,
    publishedOn: item.publishedOn,
    scheduledFor: item.scheduledFor,
    summary: (item.summary || "").slice(0, 400),
    url: item.url,
    imageUrl: item.imageUrl,
  }));

  return NextResponse.json(
    { ok: true, news: headlines },
    {
      headers: {
        "Cache-Control": "public, max-age=300",
      },
    },
  );
}
