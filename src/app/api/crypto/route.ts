/**
 * GET /api/crypto
 * Serves the same persisted snapshot as /api/crypto/markets.
 */
import { NextResponse } from "next/server";
import { marketsBody } from "@/lib/crypto-api-body";
import { readSharedCryptoBoard } from "@/lib/crypto-board-store";
import { enrichListedCoins } from "@/lib/crypto-source";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const board = await readSharedCryptoBoard();
    const coins = await enrichListedCoins(board.coins);
    return NextResponse.json(marketsBody(coins, board.notice), {
      headers: { "cache-control": "no-store" },
    });
  } catch (err) {
    console.error("[api/crypto] error:", err instanceof Error ? err.message.slice(0, 160) : "failed");
    return NextResponse.json(marketsBody(null, null), {
      headers: { "cache-control": "no-store" },
    });
  }
}
