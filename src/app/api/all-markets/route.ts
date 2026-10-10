import { NextResponse } from "next/server";
import { parseAllMarketsExchange, parseAllMarketsPage } from "@/lib/all-markets-query";
import { loadStockBoardPage } from "@/lib/stock-board.server";

export const dynamic = "force-dynamic";

/**
 * GET /api/all-markets?exchange=NZX|ASX|DOW|NASDAQ|NYSE&page=1&q=
 *
 * One page of a stock board. Prices come from Yahoo Finance, then Twelve Data
 * when a key is set, then the last saved print. A missing price is the sentence
 * "Not in this response". Directory seed prices are not used.
 *
 * pull-check:stock-markets-full-2026-10-11
 * pull-check:retest4-2026-10-11
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = parseAllMarketsExchange(url.searchParams.get("exchange"));
    if (!parsed.ok) {
      return NextResponse.json(
        { ok: false, error: "Unknown exchange. Use NZX, ASX, DOW, NASDAQ or NYSE." },
        { status: 400 },
      );
    }
    const page = await loadStockBoardPage(parsed.exchange, {
      page: parseAllMarketsPage(url.searchParams.get("page")),
      query: url.searchParams.get("q") || "",
      includeDerivatives: url.searchParams.get("derivatives") === "1",
    });
    const quotedCount = page.rows.filter((row) => row.quoted).length;
    return NextResponse.json({
      ok: true,
      data: {
        exchange: page.board,
        label: page.label,
        sub: page.sub,
        currency: page.currency,
        live: false,
        liveCount: quotedCount,
        total: page.shown,
        matchTotal: page.total,
        page: page.page,
        pageCount: page.pageCount,
        coverage: page.coverage,
        note: page.note,
        asOf: page.asOf,
        freshness: page.freshness,
        unpricedCount: page.unpricedCount,
        footnote: page.footnote,
        rows: page.rows.map((row) => ({
          ticker: row.ticker,
          symbol: row.symbol,
          name: row.name,
          sector: row.sector,
          exchange: row.board,
          currency: row.currency,
          price: row.price,
          changePct: row.changePct,
          changeAbs: row.changeAbs,
          priceLabel: row.priceLabel,
          changeLabel: row.changeLabel,
          source: row.source,
          quotedAt: row.quotedAt,
          asOf: row.asOf,
          dayHigh: null,
          dayLow: null,
          volume: null,
          marketCap: null,
          live: false,
          quoted: row.quoted,
          freshness: row.quoted ? `${row.asOf} · ${row.source}` : row.priceLabel,
        })),
      },
    }, {
      headers: { "Cache-Control": "public, max-age=15, s-maxage=30, stale-while-revalidate=120" },
    });
  } catch (err: unknown) {
    console.error("[api/all-markets] GET error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to load market list" },
      { status: 500 }
    );
  }
}
