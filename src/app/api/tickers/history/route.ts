import { NextResponse } from "next/server";
import { fetchYahooCloseOn } from "@/lib/yahoo-finance";
import { currencyForTicker, type CurrencyCode } from "@/lib/currency";

export const dynamic = "force-dynamic";

/**
 * GET /api/tickers/history?symbol=&type=&date=yyyy-mm-dd
 * Suggests that day's close and the NZD exchange rate. Both stay overridable.
 * A missing print returns price: null rather than today's quote.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
    const type = (searchParams.get("type") || "stock").trim().toLowerCase();
    const date = (searchParams.get("date") || "").slice(0, 10);
    if (!symbol || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ ok: false, error: "Symbol and date are required" }, { status: 400 });
    }

    const yahooSymbol =
      type === "metal" ? (symbol === "SILVER" ? "SI=F" : "GC=F") : type === "crypto" ? `${symbol}-USD` : symbol;
    const native: CurrencyCode =
      type === "metal" ? "NZD" : type === "crypto" ? "USD" : currencyForTicker(symbol, "stock");
    const close = await fetchYahooCloseOn(yahooSymbol, date);
    const fxCurrency: CurrencyCode = type === "metal" || type === "crypto" ? "USD" : native;
    const fxRate = await fxOnDate(date, fxCurrency);
    let price = close;
    let currency: CurrencyCode = type === "crypto" ? "USD" : native;
    if (type === "metal" && close != null && fxRate > 0) {
      price = Math.round(close * fxRate * 100) / 100;
      currency = "NZD";
    }
    return NextResponse.json({
      ok: true,
      data: { symbol, date, price, currency, fxRate: currency === "NZD" && type !== "crypto" ? 1 : fxRate },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "History lookup failed";
    console.error("[api/tickers/history]", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** NZD per 1 unit of currency on that day. Frankfurter; baseline if it is down. */
async function fxOnDate(day: string, currency: CurrencyCode): Promise<number> {
  if (currency === "NZD") return 1;
  try {
    const res = await fetch(`https://api.frankfurter.app/${day}?from=${currency}&to=NZD`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return currency === "USD" ? 1.67 : 1.09;
    const json = (await res.json()) as { rates?: { NZD?: number } };
    const rate = Number(json?.rates?.NZD);
    return rate > 0 ? rate : currency === "USD" ? 1.67 : 1.09;
  } catch (err) {
    console.error("[api/tickers/history] FX lookup failed", err);
    return currency === "USD" ? 1.67 : 1.09;
  }
}
