import { NextResponse } from "next/server";
import { getStableSessionUser, getTradeSessionUser } from "@/lib/session";
import { applyTransaction, loadLedger, movementRejectionForUser } from "@/lib/transactions";
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
  try {
    const user = await getTradeSessionUser();
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

    const rejection = await movementRejectionForUser(user, input, { fromHoldingEdit: false });
    if (rejection) {
      return NextResponse.json({ ok: false, error: rejection }, { status: 400 });
    }

    const result = await applyTransaction(user, input);
    // Re-read the ledger so the client gets fresh rollups in one round-trip.
    const ledger = await loadLedger({ ...user, cash_balance: result.cashBalance });

    console.log(
      `[api/transactions] ${input.type} recorded for user ${user._id} — cash ${result.cashBalance}, realized ${result.realizedNZD}`
    );

    try {
      const prefs = await readActivityEmailPrefs();
      previewActivityEmail({
        kind: "trade-ledger",
        to: user.email,
        name: user.name,
        prefs,
        tradeLabel: input.type,
        amountNzd: result.cashBalance,
        when: input.trade_date || input.executed_at || new Date(),
      });
    } catch (mailErr) {
      console.error("[api/transactions] Trade email preview failed (non-fatal):", mailErr);
    }

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
    if (String(row.type || "") !== "dividend") {
      return NextResponse.json(
        { ok: false, error: "Only a dividend can be removed from this page." },
        { status: 400 }
      );
    }
    const result = await planOrApplyLedgerReversal(id, true);
    invalidateBookCache(user._id);
    return NextResponse.json({ ok: true, data: result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "That dividend was not removed.";
    console.error("[api/transactions] DELETE error:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
