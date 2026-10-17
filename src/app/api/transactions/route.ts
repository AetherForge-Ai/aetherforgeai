import { DUPLICATE_DIVIDEND_CODE, findDuplicateDividendTx } from "@/lib/dividend-ledger";
import { NextResponse } from "next/server";
import { checkTickerQuota } from "@/lib/entitlements";
import { LEDGER_ROW_EDIT } from "@/lib/feature-flags";
import { editedTradeRow, originalTradeInput } from "@/lib/ledger-row-edit";
import { firstOversell, OVERSELL_BLOCK, type ReversalTxn } from "@/lib/ledger-reversal";
import { getStableSessionUser, getTradeSessionUser } from "@/lib/session";
import { applyTransaction, ledgerAfterBooking, loadLedger } from "@/lib/transactions";
import { tradeSchema } from "@/lib/trade-schema";
import { hasForeignOwner, requestClaimsOtherUser } from "@/lib/account-guard";
import { accountMismatchResponse, privateJson } from "@/lib/account-response";
import { TRADE_CONFIRM_REQUIRED } from "@/lib/trade-confirm";
import { previewActivityEmail } from "@/lib/activity-email";
import { readActivityEmailPrefs } from "@/lib/activity-email-server";
import { invalidateBookCache } from "@/lib/book-cache";
import { planOrApplyLedgerReversal } from "@/lib/ledger-reversal-apply";
import { totalumSdk } from "@/lib/totalum";

export const dynamic = "force-dynamic";

// GET /api/transactions — the user's ledger + cash balance + realized P&L rollups
export async function GET(req: Request) {
  try {
    const user = await getStableSessionUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    // UI account (x-af-user-id) or a user-record id that isn't this session
    // means the body would be someone else's cash. Refuse it outright.
    if (user.identityConflict || requestClaimsOtherUser(req, user._id)) {
      console.error("[api/transactions] Refusing cross-account ledger", {
        sessionUserId: user._id,
        claimed: req.headers.get("x-af-user-id"),
        identityConflict: user.identityConflict,
      });
      return accountMismatchResponse(user._id);
    }
    const ledger = await loadLedger(user);
    if (hasForeignOwner(ledger.transactions, user._id)) {
      console.error("[api/transactions] Refusing ledger rows owned by another user", {
        sessionUserId: user._id,
      });
      return accountMismatchResponse(user._id);
    }
    // Echo userId on the envelope AND inside data so clients can reject a
    // stale/cross-user body even if one of the two is stripped by a cache.
    return privateJson({
      ok: true,
      userId: user._id,
      data: { ...ledger, userId: user._id },
    });
  } catch (err: any) {
    console.error("[api/transactions] GET error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to load transactions" },
      { status: 500 }
    );
  }
}

// POST /api/transactions — record a buy / sell / deposit / withdraw
export async function POST(req: Request) {
  const responseStarted = Date.now();
  let authMs = 0;
  try {
    const authStarted = Date.now();
    const user = await getTradeSessionUser();
    authMs = Date.now() - authStarted;
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as unknown;
    const parsed = tradeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const input = { ...parsed.data };
    if (input.type === "dividend" && input.dividend_gross != null && !(Number(input.amount) > 0)) {
      input.amount = input.dividend_gross;
    }

    // Corrections are not a public ledger type. Holding Edit writes them after
    // it has confirmed the row belongs to this signed-in user.
    if (input.type === "correction") {
      return NextResponse.json(
        { ok: false, error: "A correction can only be recorded from Holding Edit on a holding you own." },
        { status: 400 }
      );
    }

    // Per-type required-field guards (clear errors instead of silent NaNs).
    if (input.type === "buy" || input.type === "sell" || (input.type === "opening_balance" && input.ticker)) {
      if (input.confirm !== true) {
        return NextResponse.json({ ok: false, error: TRADE_CONFIRM_REQUIRED }, { status: 400 });
      }
      if (!input.ticker) {
        return NextResponse.json({ ok: false, error: "Ticker is required" }, { status: 400 });
      }
      if (!input.quantity || !input.price) {
        return NextResponse.json(
          { ok: false, error: "Quantity and price are required" },
          { status: 400 }
        );
      }
    } else if (!(input.type === "dividend" && input.dividend_gross != null) && !input.amount) {
      return NextResponse.json({ ok: false, error: "Amount is required" }, { status: 400 });
    }

    // Goal b8 CR-6: the plan's holding cap is enforced here too, so a buy of a
    // new ticker through this API cannot add an 11th Free holding (403).
    if ((input.type === "buy" || input.type === "opening_balance") && input.ticker && input.asset_type !== "metal") {
      const capped = await holdingCapRefusal(user, input.ticker, input.asset_type === "crypto" ? "crypto" : "stock");
      if (capped) return capped;
    }

    // Goal b11 CR-6 test hook: ?dryRun=1 runs every check above (auth, input,
    // plan holding cap → 403) and stops before any write. TT can POST an 11th
    // Free holding and see 403 without changing the book.
    if (new URL(req.url).searchParams.get("dryRun") === "1") {
      return NextResponse.json({ ok: true, dryRun: true, data: { wouldWrite: true, type: input.type, ticker: input.ticker ?? null } });
    }

    // The book read overlaps the write. If it is still in flight when the
    // holding, ledger and cash writes finish, the response does not wait for
    // the 5000-row query. The client merges the new row into the ledger it has.
    const priorLedger = loadLedger(user).catch(() => undefined);
    // b7 H-5: a second dividend for the same holding, NZ day and amount needs an
    // explicit "save anyway" from the member.
    if (input.type === "dividend" && input.allow_duplicate !== true && input.ticker) {
      // Only a dividend waits for the book; buys and sells never block on it.
      const ticker = input.ticker;
      const dupCheck = priorLedger.then((book) =>
        book
          ? findDuplicateDividendTx(book.transactions, {
              ticker,
              when: String(input.trade_date || input.executed_at || ""),
              amounts: [input.amount, input.dividend_gross],
            })
          : null
      );
      const dup = await dupCheck;
      if (dup) {
        return NextResponse.json(
          {
            ok: false,
            code: DUPLICATE_DIVIDEND_CODE,
            error: `A ${input.ticker.toUpperCase()} dividend for this date and amount is already recorded. Save anyway, or cancel.`,
          },
          { status: 409 }
        );
      }
    }
    let priorReady: Awaited<ReturnType<typeof loadLedger>> | null = null;
    void priorLedger.then((book) => {
      if (book) priorReady = book;
    }).catch(() => undefined);
    const result = await applyTransaction(user, input, { priorLedger });
    const ledger = priorReady
      ? ledgerAfterBooking(priorReady, result)
      : {
          transactions: result.transaction ? [result.transaction] : [],
          cashBalance: result.cashBalance,
          realizedYtd: 0,
          realizedTotal: result.realizedNZD,
          realizedYtdCount: 0,
          ledgerPartial: true,
        };
    const steps = result.confirmSteps;
    console.log(
      `[transactions] confirm auth=${authMs} holdings=${steps?.holdings ?? "-"} quote=${steps?.quote ?? "-"} ledger=${steps?.ledger ?? "-"} cash=${steps?.cash ?? "-"} cache=${steps?.cache ?? "-"} response=${Date.now() - responseStarted}`
    );

    console.log(
      `[api/transactions] ${input.type} recorded for user ${user._id} — cash ${ledger.cashBalance}, realized ${result.realizedNZD}`
    );

    void readActivityEmailPrefs()
      .then((prefs) => {
        previewActivityEmail({
          kind: "trade-ledger",
          to: user.email,
          name: user.name,
          prefs,
          tradeLabel: input.type,
          amountNzd: ledger.cashBalance,
          when: input.trade_date || input.executed_at || new Date(),
        });
      })
      .catch((mailErr) => {
        console.error("[api/transactions] Trade email preview failed (non-fatal):", mailErr);
      });

    return NextResponse.json({
      ok: true,
      data: { ...ledger, lastTransaction: result.transaction, realizedNZD: result.realizedNZD },
    });
  } catch (err: any) {
    console.error("[api/transactions] POST error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to record transaction" },
      { status: 400 }
    );
  }
}

async function holdingCapRefusal(
  user: Parameters<typeof checkTickerQuota>[0] & { _id: string },
  ticker: string,
  assetType: "stock" | "crypto"
): Promise<NextResponse | null> {
  const existing = await totalumSdk.crud.query("stock", { _filter: { user: user._id }, _limit: 1000 });
  const held = ((existing?.data as unknown as Array<{ ticker?: string; asset_type?: string; shares?: number }>) || []);
  const sym = ticker.trim().toUpperCase();
  const sleeve = held.find((h) => String(h.ticker || "").toUpperCase() === sym && (h.asset_type || "stock") === assetType);
  if (sleeve) return null;
  const quota = checkTickerQuota(user, held as never, assetType);
  if (quota.allowed) return null;
  return NextResponse.json(
    { ok: false, error: quota.message, data: { code: "ticker_limit", used: quota.used, limit: quota.limit, scope: quota.scope, upgradeHref: quota.upgradeHref } },
    { status: 403 }
  );
}

/**
 * DELETE /api/transactions?id= — remove one dividend the signed-in user owns.
 * Reuses the ledger reversal (cash is inverted, the row is deleted).
 * Buys and sells stay on the holding edit path.
 */
export async function DELETE(req: Request) {
  try {
    const user = await getTradeSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    if (user.identityConflict || requestClaimsOtherUser(req, user._id)) {
      return accountMismatchResponse(user._id);
    }
    const id = new URL(req.url).searchParams.get("id")?.trim() || "";
    if (!id) return NextResponse.json({ ok: false, error: "A dividend id is required." }, { status: 400 });
    // b7 H-5: deletes are idempotent by id. A row that is already gone (a retry,
    // a double click, a stale screen) answers 200 so the client drops it.
    const loaded = await totalumSdk.crud.getRecordById("transaction", id).catch(() => null);
    const row = (loaded as { data?: { _id?: string; type?: string; user?: string | { _id?: string } } } | null)?.data;
    if (!row?._id) {
      invalidateBookCache(user._id);
      return NextResponse.json({ ok: true, data: { alreadyRemoved: true } });
    }
    const owner = typeof row.user === "object" && row.user ? row.user._id : row.user;
    if (String(owner || "") !== String(user._id)) {
      return NextResponse.json({ ok: false, error: "That dividend was not found." }, { status: 404 });
    }
    const type = String(row.type || "");
    const trade = type === "buy" || type === "sell";
    if (type !== "dividend" && !(trade && LEDGER_ROW_EDIT)) {
      return NextResponse.json(
        { ok: false, error: "Only a dividend can be removed from this page." },
        { status: 400 }
      );
    }
    // BL-7: dry run first, so an oversell is refused before anything is written.
    const dry = await planOrApplyLedgerReversal(id, false);
    if ((dry as { blockedReason?: string | null }).blockedReason) {
      return NextResponse.json({ ok: false, error: (dry as { blockedReason: string }).blockedReason }, { status: 409 });
    }
    const result = await planOrApplyLedgerReversal(id, true);
    ledgerAudit("delete", user._id, row, result);
    invalidateBookCache(user._id);
    return NextResponse.json({ ok: true, data: result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "That dividend was not removed.";
    console.error("[api/transactions] DELETE error:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

/** BL-7 audit trail: one structured line per row change, kept in the platform log. */
function ledgerAudit(action: "delete" | "edit", userId: string, row: unknown, result: unknown) {
  const r = row as { _id?: string; type?: string; ticker?: string; quantity?: number; price?: number; executed_at?: string };
  const out = result as { cash?: { before?: number; after?: number }; holding?: { action?: string } } | undefined;
  console.info(
    "[ledger-audit]",
    JSON.stringify({
      at: new Date().toISOString(),
      action,
      user: userId,
      row: { id: r?._id, type: r?.type, ticker: r?.ticker, quantity: r?.quantity, price: r?.price, executed_at: r?.executed_at },
      cash: out?.cash,
      holding: out?.holding?.action,
    })
  );
}

/**
 * PATCH /api/transactions — BL-7 single-row edit of a buy or sell (LEDGER_ROW_EDIT).
 * Body: { id, quantity?, price?, fees?, executed_at?, confirm: true }.
 * The old row is reversed (cash, holding, FIFO) and the edited row is booked
 * through the normal trade path, so every total is recomputed the same way.
 * A change that would oversell a later sell is refused before any write.
 */
export async function PATCH(req: Request) {
  try {
    if (!LEDGER_ROW_EDIT) return NextResponse.json({ ok: false, error: "Row edit is not enabled." }, { status: 404 });
    const user = await getTradeSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    if (user.identityConflict || requestClaimsOtherUser(req, user._id)) return accountMismatchResponse(user._id);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) return NextResponse.json({ ok: false, error: "A row id is required." }, { status: 400 });
    if (body.confirm !== true) return NextResponse.json({ ok: false, error: TRADE_CONFIRM_REQUIRED }, { status: 400 });
    const loaded = await totalumSdk.crud.getRecordById("transaction", id);
    const row = (loaded as { data?: Record<string, unknown> & { _id?: string; user?: string | { _id?: string } } })?.data;
    const owner = row && (typeof row.user === "object" && row.user ? row.user._id : row.user);
    if (!row?._id || String(owner || "") !== String(user._id)) {
      return NextResponse.json({ ok: false, error: "That row was not found." }, { status: 404 });
    }
    const type = String(row.type || "");
    if (type !== "buy" && type !== "sell") {
      return NextResponse.json({ ok: false, error: "Only a buy or a sell can be edited here." }, { status: 400 });
    }
    const edited = editedTradeRow(row as never, body);
    if ("error" in edited) return NextResponse.json({ ok: false, error: edited.error }, { status: 400 });

    const all = await totalumSdk.crud.query("transaction", { _filter: { user: user._id }, _limit: 5000 });
    const rows = ((all?.data as unknown as ReversalTxn[]) || []).map((r) => (r._id === id ? { ...r, ...edited.row } : r));
    if (firstOversell(rows, String(row.ticker || ""), String(row.asset_type || "stock").toLowerCase())) {
      return NextResponse.json({ ok: false, error: OVERSELL_BLOCK }, { status: 409 });
    }

    const original = originalTradeInput(row);
    const input = { ...original, ...edited.row };
    if (type === "buy") {
      // Book the edited buy first. The original row is untouched until that
      // succeeds, so a failure leaves the ledger exactly as it was.
      const result = await applyTransaction(user, input as never, {});
      const newId = String((result.transaction as { _id?: string } | undefined)?._id || "");
      try {
        const reversed = await planOrApplyLedgerReversal(id, true);
        ledgerAudit("edit", user._id, { ...row, ...edited.row, replaced: id, _id: newId }, reversed);
      } catch (err) {
        if (newId) await planOrApplyLedgerReversal(newId, true).catch((e) => console.error("[api/transactions] PATCH undo failed", e));
        throw err;
      }
      invalidateBookCache(user._id);
      return NextResponse.json({ ok: true, data: { transaction: result.transaction, cashBalance: result.cashBalance } });
    }
    // A sell is reversed first so the edited sell is checked against the
    // holding without the old sell. If booking fails, the original is booked
    // again with every field it had (same time, price, fees, FX, notes).
    const reversed = await planOrApplyLedgerReversal(id, true);
    try {
      const result = await applyTransaction(user, input as never, {});
      ledgerAudit("edit", user._id, { ...row, ...edited.row, replaced: id }, reversed);
      invalidateBookCache(user._id);
      return NextResponse.json({ ok: true, data: { transaction: result.transaction, cashBalance: result.cashBalance } });
    } catch (err) {
      await applyTransaction(user, original as never, {}).catch((e) => console.error("[api/transactions] PATCH restore failed", e));
      invalidateBookCache(user._id);
      throw err;
    }
  } catch (err: unknown) {
    console.error("[api/transactions] PATCH error:", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "That row was not changed." }, { status: 400 });
  }
}

