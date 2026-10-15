import { NextResponse } from "next/server";
import { LEDGER_ROW_EDIT } from "@/lib/feature-flags";
import { editedTradeRow } from "@/lib/ledger-row-edit";
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

    // The book read overlaps the write. If it is still in flight when the
    // holding, ledger and cash writes finish, the response does not wait for
    // the 5000-row query. The client merges the new row into the ledger it has.
    const priorLedger = loadLedger(user).catch(() => undefined);
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
    const loaded = await totalumSdk.crud.getRecordById("transaction", id);
    const row = (loaded as { data?: { _id?: string; type?: string; user?: string | { _id?: string } } })?.data;
    if (!row?._id) return NextResponse.json({ ok: false, error: "That dividend was not found." }, { status: 404 });
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

    const reversed = await planOrApplyLedgerReversal(id, true);
    const input = {
      type: type as "buy" | "sell",
      ticker: String(row.ticker || ""),
      asset_type: (String(row.asset_type || "stock") as "stock" | "crypto" | "metal"),
      asset_name: row.asset_name ? String(row.asset_name) : undefined,
      currency: row.currency ? String(row.currency) : undefined,
      fx_rate: Number(row.fx_rate) > 0 ? Number(row.fx_rate) : undefined,
      notes: row.notes ? String(row.notes) : undefined,
      execution_status: "filled" as const,
      price_source: "user_fill" as const,
      confirm: true,
      ...edited.row,
    };
    try {
      const result = await applyTransaction(user, input as never, {});
      ledgerAudit("edit", user._id, { ...row, ...edited.row }, reversed);
      invalidateBookCache(user._id);
      return NextResponse.json({ ok: true, data: { transaction: result.transaction, cashBalance: result.cashBalance } });
    } catch (err) {
      // Put the original row back so the book is never left without it.
      await applyTransaction(user, { ...input, quantity: Number(row.quantity), price: Number(row.price), fees: Number(row.fees) || 0, executed_at: row.executed_at ? String(row.executed_at) : undefined } as never, {}).catch((e) =>
        console.error("[api/transactions] PATCH restore failed", e)
      );
      throw err;
    }
  } catch (err: unknown) {
    console.error("[api/transactions] PATCH error:", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "That row was not changed." }, { status: 400 });
  }
}
