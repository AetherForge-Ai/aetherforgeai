import { NextResponse } from "next/server";
import { planIncludesToolkit } from "@/lib/plans";
import { getCurrentUser, isStripeConfigured, hasActiveSubscription } from "@/lib/session";
import { TOOLKIT_XLSX_BASE64, TOOLKIT_FILE_NAME } from "@/lib/toolkit-file";

export const dynamic = "force-dynamic";

// Decode the embedded workbook once at module load (Workers-safe: atob is global).
function decodeToolkit(): Uint8Array {
  const binary = atob(TOOLKIT_XLSX_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// GET /api/downloads/toolkit — streams a static Excel investor toolkit template.
// The workbook is not filled from holdings or from the ledger.
// Gated to signed-in customers on a yearly plan.
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // Entitlement: yearly plans only. When Stripe is configured we also
    // require an active subscription; in demo mode (no Stripe key) a yearly
    // plan flag alone is enough so testers aren't locked out.
    const isYearly = planIncludesToolkit(user.subscription_plan);
    const entitled = isStripeConfigured()
      ? isYearly && hasActiveSubscription(user)
      : isYearly;

    if (!entitled) {
      console.warn(
        `[downloads/toolkit] Denied for user ${user._id} (plan=${user.subscription_plan}, status=${user.subscription_status})`
      );
      return NextResponse.json(
        { ok: false, error: "The Excel investor toolkit template is available on yearly plans only." },
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
