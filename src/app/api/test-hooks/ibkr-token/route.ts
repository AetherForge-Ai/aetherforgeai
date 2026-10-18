import { NextResponse } from "next/server";
import { getTradeSessionUser } from "@/lib/session";
import { testHooksAllowedFor } from "@/lib/test-hooks";
import { findConnection } from "@/lib/broker-sync/connection-store.server";

export const dynamic = "force-dynamic";

async function sha8(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d).slice(0, 4), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * b34 BS-01: proves the stored token is ciphertext. Shows only whether a row exists, the stored
 * length, whether it is digits-only (a raw Flex token is digits; ciphertext is not), and a key id
 * (first 8 hex of SHA-256 of BROKER_TOKEN_KEY). Never the token or the key. Allow-listed only.
 */
export async function GET() {
  const user = await getTradeSessionUser();
  if (!user || !testHooksAllowedFor(user as { _id?: string; email?: string })) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  const conn = await findConnection(String((user as { _id: string })._id), "ibkr").catch(() => null);
  const key = process.env.BROKER_TOKEN_KEY || "";
  return NextResponse.json(
    {
      ok: true,
      stored: !!conn,
      storedLength: conn ? conn.enc_token.length : 0,
      digitsOnly: conn ? /^\d+$/.test(conn.enc_token) : null,
      keyId: key ? await sha8(key) : null,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
