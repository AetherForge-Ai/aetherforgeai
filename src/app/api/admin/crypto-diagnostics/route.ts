import { NextResponse } from "next/server";
import { runCryptoDiagnostics } from "@/lib/crypto-diagnostics";
import { PRIVACY_OFFICER_EMAIL } from "@/lib/public-copy";
import { getCurrentUser } from "@/lib/session";

/**
 * GET /api/admin/crypto-diagnostics
 * Probes CoinGecko, GeckoTerminal, Kraken, and Coinbase from this runtime.
 * Restricted to the privacy-officer account. The body is status, latency,
 * size, row count, and an error class. It does not include keys or response bodies.
 *
 * pull-check:crypto-live-2026-10-11
 */

export const dynamic = "force-dynamic";

function denied() {
  return new NextResponse("Not found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function GET() {
  const session = await getCurrentUser();
  if (!session || session.email.trim().toLowerCase() !== PRIVACY_OFFICER_EMAIL.toLowerCase()) {
    return denied();
  }
  try {
    const report = await runCryptoDiagnostics();
    console.log(
      `[crypto-diagnostics] ${report.probes.map((probe) => `${probe.id}:${probe.status ?? probe.error}`).join(" ")}`
    );
    return NextResponse.json(report, {
      headers: { "cache-control": "no-store" },
    });
  } catch (err) {
    console.error("[crypto-diagnostics] failed:", err instanceof Error ? err.name : "failed");
    return NextResponse.json(
      { ok: false, error: "The diagnostics probe did not finish." },
      { status: 200, headers: { "cache-control": "no-store" } }
    );
  }
}
