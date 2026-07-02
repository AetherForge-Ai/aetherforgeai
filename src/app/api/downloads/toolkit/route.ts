import { NextResponse } from "next/server";
import { getCurrentUser, isStripeConfigured, hasActiveSubscription } from "@/lib/session";
import { totalumSdk } from "@/lib/totalum";
import { buildToolkitWorkbook } from "@/lib/xlsx-templates";
import type { Stock } from "@/lib/portfolio";

export const dynamic = "force-dynamic";

const YEARLY_PLANS = new Set(["yearly", "dual_yearly"]);

// GET /api/downloads/toolkit — streams the professional Excel investor toolkit.
// Gated to signed-in customers on an annual (yearly / dual_yearly) plan.
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // Entitlement: yearly subscribers only. When Stripe is configured we also
    // require an active subscription; in demo mode (no Stripe key) a yearly
    // plan flag alone is enough so testers aren't locked out.
    const isYearly = YEARLY_PLANS.has(user.subscription_plan || "");
    const entitled = isStripeConfigured()
      ? isYearly && hasActiveSubscription(user)
      : isYearly;

    if (!entitled) {
      console.warn(
        `[downloads/toolkit] Denied for user ${user._id} (plan=${user.subscription_plan}, status=${user.subscription_status})`
      );
      return NextResponse.json(
        { ok: false, error: "The Excel toolkit is available to annual subscribers only." },
        { status: 403 }
      );
    }

    // Load the customer's holdings so the workbook is pre-filled.
    let holdings: Stock[] = [];
    try {
      const result = await totalumSdk.crud.query("stock", {
        _filter: { user: user._id },
        _sort: { createdAt: "desc" },
        _limit: 500,
      });
      holdings = ((result?.data as any[]) || []) as Stock[];
    } catch (err) {
      console.error("[downloads/toolkit] Failed to load holdings, generating blank toolkit:", err);
      holdings = [];
    }

    console.log(
      `[downloads/toolkit] Generating toolkit for user ${user._id} with ${holdings.length} holdings`
    );

    const bytes = buildToolkitWorkbook(holdings);

    return new NextResponse(bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="AetherForge-AI-Investor-Toolkit.xlsx"',
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    console.error("[downloads/toolkit] error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to generate toolkit" },
      { status: 500 }
    );
  }
}
