import { NextResponse } from "next/server";
import type { CurrencyCode } from "@/lib/currency";
import { formatFxInput } from "@/lib/currency";
import { historicalNzdPerUnit } from "@/lib/fx";
import { paymentDateFx } from "@/lib/dividend-ledger";
import { getStableSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/tax/fx?currency=AUD&date=2026-10-10
 * The payment-date rate, or null when the feed has no print.
 * The baseline table is not returned.
 */
export async function GET(req: Request) {
  const user = await getStableSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const currency = String(url.searchParams.get("currency") || "").toUpperCase();
  const date = String(url.searchParams.get("date") || "");
  if (currency !== "AUD" && currency !== "USD" && currency !== "NZD") {
    return NextResponse.json({ ok: false, error: "Currency must be NZD, AUD or USD." }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ ok: false, error: "Date must be yyyy-mm-dd." }, { status: 400 });
  }
  const historical = await historicalNzdPerUnit(currency as CurrencyCode, date);
  const fx = paymentDateFx(currency as CurrencyCode, historical);
  return NextResponse.json(
    { ok: true, data: { fx: fx == null ? null : formatFxInput(fx) } },
    { headers: { "Cache-Control": "no-store" } }
  );
}
