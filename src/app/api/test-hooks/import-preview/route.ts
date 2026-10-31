import { NextResponse } from "next/server";
import { getTradeSessionUser } from "@/lib/session";
import { testHooksAllowedFor } from "@/lib/test-hooks";
import { runH10Import } from "@/lib/import/persist";
import { IMPORT_MAX_BYTES } from "@/lib/import/limits";
import { BAD_ROWS_FIXTURE, HATCH_COMMIT_FIXTURE, HATCH_FIXTURE, IBKR_COMMIT_FIXTURE, SHARESIES_COMMIT_FIXTURE, SHARESIES_FIXTURE, STAKE_COMMIT_FIXTURE, ASB_FIXTURE, JARDEN_FIXTURE, COMMSEC_FIXTURE, SWYFTX_FIXTURE, EASYCRYPTO_FIXTURE } from "@/lib/fixtures/broker-import/preview-fixtures";

export const dynamic = "force-dynamic";

const FIXTURES: Record<string, () => string> = {
  sharesies: () => SHARESIES_FIXTURE,
  hatch: () => HATCH_FIXTURE,
  // b86: EXAMPLE DATA with ECB trade-date rates, so a commit passes the 5% FX check (check unchanged).
  "hatch-commit": () => HATCH_COMMIT_FIXTURE,
  // b90 H-10: the same for Sharesies, IBKR and Stake (b84 failed these: their rates were 5-8% off the trade date).
  "sharesies-commit": () => SHARESIES_COMMIT_FIXTURE,
  "ibkr-commit": () => IBKR_COMMIT_FIXTURE,
  "stake-commit": () => STAKE_COMMIT_FIXTURE,
  // b93 H-10: ASB, Jarden, CommSec, Swyftx and Easy Crypto (AUD rows use the trade-date rate lookup).
  "asb": () => ASB_FIXTURE,
  "jarden": () => JARDEN_FIXTURE,
  "commsec": () => COMMSEC_FIXTURE,
  "swyftx": () => SWYFTX_FIXTURE,
  "easycrypto": () => EASYCRYPTO_FIXTURE,
  "bad-rows": () => BAD_ROWS_FIXTURE,
  // 6 MB: the Sharesies fixture padded with comment lines past the 5 MB cap. Never parsed.
  oversize: () => SHARESIES_FIXTURE + ("# padding\n".repeat(Math.ceil((6 * 1024 * 1024) / 10))),
};

/**
 * b85 H-10: preview-only test hook so TT can grade the Sharesies and Hatch fixtures, the 3-bad-row
 * path and the 6 MB reject on preview. Runs the same H-10 preview as /api/import (action "preview",
 * writes nothing; no new table). 404 unless GOAL_TEST_HOOKS=1 and the user is allow-listed.
 * GET /api/test-hooks/import-preview?fixture=sharesies|hatch|hatch-commit|sharesies-commit|ibkr-commit|stake-commit|asb|jarden|commsec|swyftx|easycrypto|bad-rows|oversize
 */
export async function GET(req: Request) {
  const user = await getTradeSessionUser();
  if (!user || !testHooksAllowedFor(user as { _id?: string; email?: string })) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  const name = new URL(req.url).searchParams.get("fixture") || "";
  const make = FIXTURES[name];
  if (!make) return NextResponse.json({ ok: false, error: "fixture must be sharesies, hatch, hatch-commit, sharesies-commit, ibkr-commit, stake-commit, asb, jarden, commsec, swyftx, easycrypto, bad-rows or oversize" }, { status: 400 });
  const text = make();
  const res = await runH10Import(user as never, text, { engine: "h10", action: "preview" }, "manual");
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json({ fixture: name, bytes: new TextEncoder().encode(text).length, capBytes: IMPORT_MAX_BYTES, mode: "preview", writes: 0, status: res.status, ...body }, { status: res.status });
}
