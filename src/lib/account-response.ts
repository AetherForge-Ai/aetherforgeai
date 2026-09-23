import "server-only";
import { NextResponse } from "next/server";
import { PRIVATE_NO_STORE_HEADERS } from "@/lib/account-guard";

/** 409 with the session user id and no ledger/cash/holdings body. */
export function accountMismatchResponse(sessionUserId: string) {
  return NextResponse.json(
    { ok: false, error: "account-mismatch", userId: sessionUserId },
    { status: 409, headers: PRIVATE_NO_STORE_HEADERS }
  );
}

export function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_NO_STORE_HEADERS });
}
