import { NextResponse } from "next/server";
import { getCurrentUser, isStripeConfigured, hasActiveSubscription } from "@/lib/session";
import { TOOLKIT_XLSX_BASE64, TOOLKIT_FILE_NAME } from "@/lib/toolkit-file";

export const dynamic = "force-dynamic";

const YEARLY_PLANS = new Set(["yearly", "dual_yearly"]);

// Decode the embedded workbook once at module load (Workers-safe: atob is global).
function decodeToolkit(): Uint8Array {
  const binary = atob(TOOLKIT_XLSX_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// GET /api/downloads/toolkit — streams the professional Excel investor toolkit
// (Ultra Advanced Portfolio Tracker — Stocks + Crypto, NZD).
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

    console.log(`[downloads/toolkit] Streaming toolkit "${TOOLKIT_FILE_NAME}" for user ${user._id}`);

    const bytes = decodeToolkit();

    return new NextResponse(bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${TOOLKIT_FILE_NAME}"`,
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
