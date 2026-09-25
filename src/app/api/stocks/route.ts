import { NextResponse } from "next/server";
import { hasForeignOwner, requestClaimsOtherUser } from "@/lib/account-guard";
import { accountMismatchResponse, privateJson } from "@/lib/account-response";
import { z } from "zod";
import { getStableSessionUser, getTradeSessionUser } from "@/lib/session";
import { totalumSdk } from "@/lib/totalum";
import { lookupTicker, normalizeTicker, referencePrice } from "@/lib/market";
import {
  fetchLivePrice,
  fetchLiveQuotes,
  isLiveDataConfigured,
  fetchCryptoQuotes,
  resolveCompanyNames,
} from "@/lib/market-data";
import { checkTickerQuota } from "@/lib/entitlements";
import { checkFillSanity, ADVISORY_NOTE, aucklandDateTimeISO } from "@/lib/fill-integrity";
import { canonicalCryptoId } from "@/lib/crypto-ids";
import { venueForTicker } from "@/lib/ledger-schema";
import { feedEntryForTicker } from "@/lib/feed-mapping";
import { logLedgerAudit, appendAuditNote } from "@/lib/ledger-audit";
import { getMetalsSpot } from "@/lib/metals";
import {
  bullionMarkForHolding,
  bullionNameContaminated,
  isBullionHolding,
  quoteRouteForHolding,
  resolveHoldingMarkPrice,
} from "@/lib/metal-valuation";
import { mergeFreshQuantities } from "@/lib/holding-snapshot";
import { TRADE_CONFIRM_REQUIRED } from "@/lib/trade-confirm";

/**
 * Overlay genuine LIVE prices onto a user's holdings and persist any that moved.
 * Equities use Twelve Data → Yahoo fallback; crypto uses CoinGecko → Yahoo. This
 * is what keeps the portfolio valuation accurate the instant the dashboard loads
 * — instead of valuing positions at whatever `current_price` was last stored
 * (e.g. a seeded SOL at $198.40). Fully non-fatal: on any failure the stored
 * price is kept, so a data-provider outage can never break the portfolio load.
 */
async function persistBullionMarks(holdings: any[]): Promise<void> {
  const bullion = holdings.some((s) => isBullionHolding(s.asset_type, s.ticker, s.company_name));
  if (!bullion) return;
  let spot = null;
  try {
    spot = await getMetalsSpot();
  } catch (err) {
    console.error("[api/stocks] Bullion spot fetch failed (decontaminating stored prints):", err);
  }
  await Promise.all(
    holdings.map(async (s, i) => {
      if (!isBullionHolding(s.asset_type, s.ticker, s.company_name)) return;
      const marked = bullionMarkForHolding(s, spot);
      if (!(marked > 0)) return;
      const prev = Number(s.current_price) || 0;
      // Plain object so the JSON response carries the troy-oz mark even if the
      // SDK record ignores later property writes.
      holdings[i] = { ...s, current_price: marked };
      if (Math.abs(prev - marked) < 1e-6) return;
      try {
        await totalumSdk.crud.editRecordById("stock", s._id, { current_price: marked });
        console.log(
          `[api/stocks] Bullion ${s.ticker} current_price ${prev} → ${marked} NZD/oz (persisted)`
        );
      } catch (err) {
        console.error(`[api/stocks] Failed to persist bullion price for ${s._id} (${s.ticker}):`, err);
      }
    })
  );
}

async function overlayLivePrices(holdings: any[]): Promise<void> {
  if (!holdings.length) return;
  // Bullion first, and alone. An equity/crypto quote failure must not leave
  // GOLD marked at the Yahoo Gold.com, Inc. print (~US$44).
  await persistBullionMarks(holdings);

  const equityTickers: string[] = [];
  const cryptoTickers: string[] = [];
  for (const s of holdings) {
    const route = quoteRouteForHolding(s.asset_type, s.ticker, s.company_name);
    if (route === "bullion") continue;
    if (route === "crypto") cryptoTickers.push(String(s.ticker));
    else equityTickers.push(String(s.ticker));
  }
  if (!equityTickers.length && !cryptoTickers.length) return;

  try {
    const [equityQuotes, cryptoQuotes] = await Promise.all([
      isLiveDataConfigured() && equityTickers.length ? fetchLiveQuotes(equityTickers) : Promise.resolve({}),
      cryptoTickers.length ? fetchCryptoQuotes(cryptoTickers) : Promise.resolve({}),
    ]);
    const equityMap = equityQuotes as Record<string, { price: number }>;
    const cryptoMap = cryptoQuotes as Record<string, { price: number }>;
    if (!Object.keys(equityMap).length && !Object.keys(cryptoMap).length) {
      console.warn("[api/stocks] No live equity/crypto quotes — serving stored prices for those holdings.");
      return;
    }

    let updated = 0;
    await Promise.all(
      holdings.map(async (s, i) => {
        const ticker = String(s.ticker || "");
        const route = quoteRouteForHolding(s.asset_type, ticker, s.company_name);
        if (route === "bullion") return;
        const key = ticker.toUpperCase();
        const marked = resolveHoldingMarkPrice({
          ticker,
          assetType: s.asset_type,
          storedPrice: Number(s.current_price) || 0,
          purchasePrice: Number(s.purchase_price) || 0,
          equityQuote: route === "equity" ? equityMap[key]?.price : undefined,
          cryptoQuote: route === "crypto" ? cryptoMap[key]?.price : undefined,
        });
        if (marked == null || !(marked > 0)) return;
        const prev = Number(s.current_price) || 0;
        holdings[i] = { ...s, current_price: marked };
        if (Math.abs(prev - marked) < 1e-9) return;
        try {
          await totalumSdk.crud.editRecordById("stock", s._id, { current_price: marked });
          updated++;
        } catch (err) {
          console.error(`[api/stocks] Failed to persist live price for ${s._id} (${s.ticker}):`, err);
        }
      })
    );
    console.log(`[api/stocks] Live price overlay applied (${updated} equity/crypto holdings re-priced).`);
  } catch (err) {
    console.error("[api/stocks] Equity/crypto price overlay failed (bullion marks already applied):", err);
  }
}

/**
 * A holding "needs a real name" when its `company_name` is empty or merely
 * echoes the ticker — e.g. a manually-added "WOR.AX" that was stored as
 * company_name "WOR.AX" (or "WOR"). These are exactly the rows the dashboard
 * renders as a bare symbol instead of the company they represent.
 */
function needsCompanyName(h: any): boolean {
  if (bullionNameContaminated(h.asset_type, h.ticker, h.company_name)) return true;
  const name = String(h.company_name || "").trim();
  if (!name) return true;
  const ticker = String(h.ticker || "").trim().toUpperCase();
  const bare = ticker.replace(/\.(NZ|AX|L)$/, "");
  const upper = name.toUpperCase();
  return upper === ticker || upper === bare;
}

/**
 * Backfill genuine company names onto holdings that are missing one (or whose
 * name just echoes the ticker), then persist so the fix is permanent. This is
 * what turns "WOR.AX" into "Worley Limited" on the dashboard. Fully non-fatal:
 * on any failure the existing value is kept.
 */
async function overlayCompanyNames(holdings: any[]): Promise<void> {
  const missing = holdings.filter(needsCompanyName);
  if (!missing.length) return;

  try {
    const names = await resolveCompanyNames(
      missing.map((h) => ({ ticker: String(h.ticker), asset_type: h.asset_type }))
    );
    let updated = 0;
    await Promise.all(
      missing.map(async (h) => {
        const resolved = names[String(h.ticker).toUpperCase()];
        if (!resolved || resolved === h.company_name) return;
        h.company_name = resolved; // reflect on the first render immediately
        try {
          await totalumSdk.crud.editRecordById("stock", h._id, { company_name: resolved });
          updated++;
        } catch (err) {
          console.error(`[api/stocks] Failed to persist company_name for ${h._id} (${h.ticker}):`, err);
        }
      })
    );
    console.log(`[api/stocks] Company-name backfill applied (${updated}/${missing.length} holdings named).`);
  } catch (err) {
    console.error("[api/stocks] Company-name backfill failed (serving stored names):", err);
  }
}

const createSchema = z.object({
  ticker: z.string().min(1, "Ticker is required").max(12),
  asset_type: z.enum(["stock", "crypto"]).optional(),
  shares: z.number().positive("Shares must be greater than 0"),
  purchase_price: z.number().positive("Purchase price must be greater than 0"),
  purchase_date: z.string().optional(),
  company_name: z.string().optional(),
  sector: z.string().optional(),
  execution_status: z.enum(["idea", "paper", "filled"]).optional(),
  fees: z.number().min(0).optional(),
  price_source: z.enum(["user_fill", "broker_import", "session_close", "live_quote", "bot_signal"]).optional(),
  cash_or_notional: z.number().optional(),
  soft_override_confirmed: z.boolean().optional(),
  typed_live_override: z.string().optional(),
  broker: z.string().max(80).optional(),
  notes: z.string().max(2000).optional(),
  prior_close: z.number().optional(),
  session_close_date: z.string().optional(),
  confirm: z.boolean().optional(),
});

export const dynamic = "force-dynamic";

// GET /api/stocks?asset_type=stock|crypto — list the current user's holdings
export async function GET(req: Request) {
  try {
    const user = await getStableSessionUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    if (user.identityConflict || requestClaimsOtherUser(req, user._id)) {
      console.error("[api/stocks] Refusing cross-account holdings", {
        sessionUserId: user._id,
        claimed: req.headers.get("x-af-user-id"),
      });
      return accountMismatchResponse(user._id);
    }

    // NOTE: brand-new accounts start with an EMPTY portfolio. We deliberately do
    // NOT auto-seed sample holdings — injecting tickers the user never bought
    // corrupts their real portfolio, cash balance and P&L. The dashboard shows a
    // friendly empty state prompting them to add their first holding instead.

    const assetType = new URL(req.url).searchParams.get("asset_type");

    const result = await totalumSdk.crud.query("stock", {
      _filter: { user: user._id },
      _sort: { createdAt: "desc" },
      _limit: 500,
    });

    let stocks = (result?.data as any[]) || [];
    // Never price or return another account's rows (shared-isolate query mixup).
    if (hasForeignOwner(stocks, user._id)) {
      console.error("[api/stocks] Refusing holdings owned by another user", {
        sessionUserId: user._id,
      });
      return accountMismatchResponse(user._id);
    }

    // Re-price EVERY holding with live market data before returning, so the
    // portfolio value the dashboard renders is accurate on first paint (not the
    // last-stored/seeded price). Persists any that moved. Non-fatal on failure.
    // In parallel, backfill real company names onto any holding stored as a bare
    // ticker (e.g. "WOR.AX" → "Worley Limited"). Both are independent + non-fatal.
    // Names first so the bullion price copy includes a corrected company_name.
    // Live prices (and the bullion spot persist) run after, on their own.
    await overlayCompanyNames(stocks);
    await overlayLivePrices(stocks);

    // Quote fetches outlive a buy that committed while this request was in
    // flight. Re-read quantity so the response cannot paint the pre-trade shares.
    try {
      const fresh = await totalumSdk.crud.query("stock", {
        _filter: { user: user._id },
        _limit: 500,
      });
      stocks = mergeFreshQuantities(stocks, (fresh?.data as { _id?: string; shares?: number; purchase_price?: number }[]) || []);
    } catch (err) {
      console.error("[api/stocks] Quantity re-read failed (serving the overlay snapshot):", err);
    }

    // Legacy rows without asset_type are treated as stock.
    if (assetType === "stock" || assetType === "crypto") {
      stocks = stocks.filter((s) => (s.asset_type || "stock") === assetType);
    }
    console.log(
      `[api/stocks] GET returned ${stocks.length} holdings for user ${user._id} (filter: ${assetType || "all"})`
    );

    return privateJson({ ok: true, userId: user._id, data: stocks });
  } catch (err: any) {
    console.error("[api/stocks] GET error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to load stocks" }, { status: 500 });
  }
}

// POST /api/stocks — add a holding
export async function POST(req: Request) {
  try {
    const user = await getTradeSessionUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as unknown;
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const ticker = normalizeTicker(parsed.data.ticker);
    const assetType = parsed.data.asset_type || "stock";
    const info = lookupTicker(ticker);
    const purchase_price = parsed.data.purchase_price;

    // Enforce the plan's ticker quota (FREE = 3 across both bots; paid = per bot).
    // Never trust the client — this is the authoritative gate, so a free member
    // cannot add unlimited holdings by calling the API directly.
    const existing = await totalumSdk.crud.query("stock", {
      _filter: { user: user._id },
      _limit: 1000,
    });
    const held = (existing?.data as any[]) || [];
    const existingSleeve = held.find(
      (h) =>
        String(h.ticker || "").toUpperCase() === ticker.toUpperCase() &&
        (h.asset_type || "stock") === assetType
    );
    const quota = checkTickerQuota(user, held, assetType);
    if (!quota.allowed && !existingSleeve) {
      console.log(
        `[api/stocks] Quota reached for user ${user._id}: ${quota.used}/${quota.limit} (${quota.scope}) — blocking add of ${ticker}`
      );
      return NextResponse.json(
        {
          ok: false,
          error: quota.message,
          data: { code: "ticker_limit", used: quota.used, limit: quota.limit, scope: quota.scope },
        },
        { status: 403 }
      );
    }

    // Prefer a live quote when available; else use the curated reference price.
    // Crypto uses CoinGecko (no key); stocks use Twelve Data (needs a key).
    // Never fatal — falls back on any error.
    let current_price = referencePrice(ticker, purchase_price);
    try {
      if (assetType === "crypto") {
        const quotes = await fetchCryptoQuotes([ticker]);
        const live = quotes[ticker.toUpperCase()]?.price;
        if (live && live > 0) current_price = live;
      } else if (isLiveDataConfigured()) {
        const livePrice = await fetchLivePrice(ticker);
        if (livePrice && livePrice > 0) current_price = livePrice;
      }
    } catch (err) {
      console.error(`[api/stocks] Live price lookup failed for ${ticker} (non-fatal):`, err);
    }

    const executionStatus = parsed.data.execution_status || "filled";
    if (executionStatus === "filled" && parsed.data.confirm !== true) {
      return NextResponse.json({ ok: false, error: TRADE_CONFIRM_REQUIRED }, { status: 400 });
    }
    if (executionStatus === "idea" || executionStatus === "paper") {
      // Ideas/paper from Stox/Koins/Headmaster — no filled ledger, no realized P&L.
      const feed = feedEntryForTicker(ticker);
      const record = {
        ticker,
        asset_type: assetType,
        instrument_type: assetType === "crypto" ? "crypto" : "equity",
        venue: venueForTicker(ticker, assetType),
        asset_id: assetType === "crypto" ? canonicalCryptoId(ticker) : (feed?.providerId || ticker),
        company_name: parsed.data.company_name || info?.name || ticker,
        sector: parsed.data.sector || info?.sector || (assetType === "crypto" ? "Digital Assets" : "Other"),
        shares: parsed.data.shares,
        purchase_price: purchase_price,
        fill_price: purchase_price,
        current_price,
        mark_price: current_price,
        purchase_date: parsed.data.purchase_date || null,
        execution_status: executionStatus,
        fees: parsed.data.fees,
        price_source: parsed.data.price_source || "bot_signal",
        signal_price: purchase_price,
        notes: appendAuditNote(parsed.data.notes, `${executionStatus} holding — not a broker fill. ${ADVISORY_NOTE}`),
        user: user._id,
      };
      const result = await totalumSdk.crud.createRecord("stock", record);
      logLedgerAudit({ action: `holding_${executionStatus}`, ticker, userId: user._id, after: record as any });
      return NextResponse.json({ ok: true, data: result?.data || record });
    }

    const sanity = checkFillSanity({
      ticker,
      quantity: parsed.data.shares,
      fillPrice: purchase_price,
      liveSpot: current_price > 0 ? current_price : null,
      cashOrNotional: parsed.data.cash_or_notional,
      assetType,
      fillCurrency: assetType === "crypto" ? "USD" : undefined,
      typedLiveOverride: parsed.data.typed_live_override,
      softOverrideConfirmed: !!parsed.data.soft_override_confirmed,
      priceSource: parsed.data.price_source || "user_fill",
      priorClose: parsed.data.prior_close,
      tradeDate: parsed.data.purchase_date,
      sessionCloseDate: parsed.data.session_close_date,
    });
    if (sanity.blocked) {
      logLedgerAudit({ action: "holding_fill_blocked", ticker, userId: user._id, meta: { message: sanity.message } });
      return NextResponse.json({ ok: false, error: sanity.message, data: { code: sanity.code, ...sanity } }, { status: 400 });
    }

    // Resolve a real company name up-front: client value → curated directory →
    // live provider (Yahoo for equities / curated map for crypto). Only falls
    // back to the bare ticker if every source is unavailable. Non-fatal.
    let company_name = parsed.data.company_name || info?.name || "";
    if (!company_name) {
      try {
        const names = await resolveCompanyNames([{ ticker, asset_type: assetType }]);
        company_name = names[ticker.toUpperCase()] || "";
      } catch (err) {
        console.error(`[api/stocks] Name resolution failed for ${ticker} (non-fatal):`, err);
      }
    }
    if (!company_name) company_name = ticker;

    // Merge into an existing sleeve for the same ticker + asset class so a
    // double-submit (or second "Add holding") never creates a confusing duplicate lot.
    const sameSleeve = existingSleeve;
    if (sameSleeve?._id) {
      const oldShares = Number(sameSleeve.shares) || 0;
      const oldAvg = Number(sameSleeve.purchase_price) || 0;
      const addShares = parsed.data.shares;
      const newShares = oldShares + addShares;
      const newAvg =
        newShares > 0 ? (oldShares * oldAvg + addShares * purchase_price) / newShares : purchase_price;
      const patch = {
        shares: Math.round((newShares + Number.EPSILON) * 1e6) / 1e6,
        purchase_price: Math.round((newAvg + Number.EPSILON) * 1e6) / 1e6,
        current_price,
        company_name: company_name || sameSleeve.company_name,
        purchase_date: parsed.data.purchase_date || sameSleeve.purchase_date || new Date().toISOString().slice(0, 10),
      };
      await totalumSdk.crud.editRecordById("stock", sameSleeve._id, patch);
      console.log(
        `[api/stocks] POST merged ${addShares} into existing ${ticker} for user ${user._id} → ${patch.shares} @ ${patch.purchase_price}`
      );
      return NextResponse.json({
        ok: true,
        data: { ...sameSleeve, ...patch, _id: sameSleeve._id, merged: true },
      });
    }

    const record = {
      ticker,
      asset_type: parsed.data.asset_type || "stock",
      company_name,
      sector: parsed.data.sector || info?.sector || (parsed.data.asset_type === "crypto" ? "Digital Assets" : "Other"),
      shares: parsed.data.shares,
      purchase_price,
      // Persist the purchase date (defaults to today when the client omits it), so
      // the holdings table can show + sort by it and P&L reflects the real entry day.
      purchase_date: parsed.data.purchase_date || new Date().toISOString().slice(0, 10),
      current_price,
      user: user._id,
    };

    const result = await totalumSdk.crud.createRecord("stock", record);
    console.log(`[api/stocks] POST created holding ${ticker} for user ${user._id}`);

    return NextResponse.json({ ok: true, data: result?.data ?? record });
  } catch (err: any) {
    console.error("[api/stocks] POST error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to add stock" }, { status: 500 });
  }
}
