import { NextResponse } from "next/server";
import { privateJson } from "@/lib/account-response";
import { getCurrentUser } from "@/lib/session";
import { totalumSdk } from "@/lib/totalum";
import { fetchLiveQuotes } from "@/lib/market-data";
import { loadMarketNews } from "@/lib/market-news";
import { mentionsHoldingTicker } from "@/lib/news-present";
import { composeWatchNotices, type WatchQuote } from "@/lib/holding-alert";
import { encodeWatch, rowToWatch, watchSpecError, type WatchSpec } from "@/lib/watch-alerts";
import { parseSimulate, SIMULATED_SOURCE, TEST_HOOKS_ENABLED } from "@/lib/test-hooks";
import { aucklandDateISO } from "@/lib/fill-integrity";

export const dynamic = "force-dynamic";

type Row = { _id?: string; ticker?: string; status?: string; instructions?: string; createdAt?: unknown };

/**
 * GET /api/watches — the member's Alerts v1 watches and the in-app notices
 * that fired on this refresh. Nothing is emailed.
 * Test mode: ?simulate=TICKER:price:changePct and ?simulateNews=TICKER.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const res = await totalumSdk.crud.query("price_alert", { _filter: { user: user._id }, _limit: 200 });
  const rows = ((res?.data as unknown as Row[]) || []).filter((r) => String(r.status || "") !== "archived");
  const simulated = parseSimulate(url.searchParams.get("simulate"));
  const simNews = new Set(
    TEST_HOOKS_ENABLED
      ? String(url.searchParams.get("simulateNews") || "")
          .split(",")
          .map((t) => t.trim().toUpperCase())
          .filter(Boolean)
      : []
  );
  const base = rows.map((r) => rowToWatch(r)).filter((w): w is NonNullable<typeof w> => w != null);
  const tickers = Array.from(new Set(base.map((w) => w.ticker)));

  const quotes: Record<string, WatchQuote> = {};
  const now = new Date();
  if (tickers.length) {
    const live = await fetchLiveQuotes(tickers).catch(() => ({}) as Record<string, never>);
    for (const t of tickers) {
      const q = (live as Record<string, { price: number; changePct: number; source?: string; quotedAt?: string }>)[t];
      quotes[t] = q
        ? { price: q.price, changePct: q.changePct, source: q.source || "Public market data, delayed", asOf: q.quotedAt || now.toISOString() }
        : { price: null, changePct: null, source: "No quote on this refresh", asOf: now.toISOString() };
    }
  }
  for (const s of simulated) {
    quotes[s.ticker] = { price: s.price, changePct: s.changePct, source: SIMULATED_SOURCE, asOf: now.toISOString() };
  }

  const headlines = new Map<string, string>();
  if (base.some((w) => w.kind === "news")) {
    const newsTickers = base.filter((w) => w.kind === "news").map((w) => w.ticker);
    const items = await loadMarketNews("stock").catch(() => []);
    const dayAgo = now.getTime() - 24 * 60 * 60 * 1000;
    for (const t of newsTickers) {
      const hit = items.find(
        (n) => mentionsHoldingTicker(n.headline, n.summary || "", [t]) && new Date(n.time).getTime() >= dayAgo
      );
      if (hit) {
        headlines.set(t, `${hit.headline} (${hit.source})`);
        if (!quotes[t]) quotes[t] = { price: null, changePct: null, source: hit.source, asOf: hit.time };
      }
    }
  }
  for (const t of simNews) {
    headlines.set(t, `Simulated test headline for ${t}`);
    quotes[t] = quotes[t] && quotes[t].source === SIMULATED_SOURCE ? quotes[t] : { price: null, changePct: null, source: SIMULATED_SOURCE, asOf: now.toISOString() };
  }

  const watches = rows
    .map((r) => rowToWatch(r, headlines.get(String(r.ticker || "").toUpperCase()) ?? null))
    .filter((w): w is NonNullable<typeof w> => w != null);
  const notices = composeWatchNotices({ alerts: watches, quotes, now, today: aucklandDateISO() });
  return privateJson({ ok: true, sent: false, simulated: simulated.length > 0 || simNews.size > 0, data: { watches, notices } });
}

/** POST /api/watches — create a watch { ticker, kind, level?, side?, movePct?, exDate? }. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Partial<WatchSpec> & { ticker?: string };
  const ticker = String(body.ticker || "").trim().toUpperCase();
  if (!/^[A-Z0-9.\-]{1,12}$/.test(ticker)) return NextResponse.json({ ok: false, error: "Enter a ticker." }, { status: 400 });
  const error = watchSpecError(body);
  if (error) return NextResponse.json({ ok: false, error }, { status: 400 });
  const spec: WatchSpec = {
    kind: body.kind!,
    ...(body.kind === "price_level" ? { level: Number(body.level), side: body.side } : {}),
    ...(body.kind === "percent_move" ? { movePct: Number(body.movePct) } : {}),
    ...(body.kind === "ex_dividend" ? { exDate: body.exDate } : {}),
  };
  const saved = await totalumSdk.crud.createRecord("price_alert", {
    user: user._id,
    ticker,
    instructions: encodeWatch(spec),
    status: "active",
  });
  return NextResponse.json({ ok: true, data: saved?.data ?? null });
}
