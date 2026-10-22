import { describe, expect, it } from "vitest";
import type { CoinMarket } from "@/lib/crypto-market";
import { CRYPTO_LIST_CAP, CRYPTO_ROW_DROP_AFTER_MS, cryptoRowDelayed, unionCryptoList } from "@/lib/crypto-row-delay";

const now = Date.parse("2026-10-22T07:09:00Z");
const iso = (ago: number) => new Date(now - ago).toISOString();
const coin = (rank: number, quotedAt: string, price = 1): CoinMarket =>
  ({ id: `c${rank}`, symbol: `C${rank}`, rank, price, change24h: 0, quotedAt, source: "coingecko" }) as unknown as CoinMarket;
const list = (n: number, quotedAt: string, price = 1) => Array.from({ length: n }, (_, i) => coin(i + 1, quotedAt, price));

describe("H-1 b57: keep the last good crypto list (TT health 22 Oct: 400 → 365 → 264)", () => {
  it("a page-1-only refresh keeps all 400 rows; the 150 it lacks keep their time and show delayed", () => {
    const saved = { at: iso(20 * 60_000), coins: list(400, iso(20 * 60_000)) };
    const out = unionCryptoList(saved, list(250, iso(0), 2), iso(0));
    expect(out).toHaveLength(400);
    expect(out.slice(0, 250).every((c) => c.price === 2 && !cryptoRowDelayed(c.quotedAt, now))).toBe(true);
    expect(out.slice(250).every((c) => c.price === 1 && cryptoRowDelayed(c.quotedAt, now))).toBe(true);
  });
  it("repeated short refreshes never shrink the list, and a full refresh restores it", () => {
    let saved = { at: iso(60 * 60_000), coins: list(400, iso(60 * 60_000)) };
    for (let i = 3; i >= 1; i--) saved = { at: iso(i * 16 * 60_000), coins: unionCryptoList(saved, list(255, iso(i * 16 * 60_000)), iso(i * 16 * 60_000)) };
    expect(saved.coins).toHaveLength(400);
    expect(unionCryptoList({ at: iso(60_000), coins: list(264, iso(60_000)) }, list(400, iso(0)), iso(0))).toHaveLength(CRYPTO_LIST_CAP);
  });
  it("never swaps in an older quote and drops rows older than a day", () => {
    const saved = { at: iso(0), coins: [coin(1, iso(0), 5), coin(2, iso(CRYPTO_ROW_DROP_AFTER_MS + 60_000))] };
    const out = unionCryptoList(saved, [coin(1, iso(60_000), 9)], iso(0));
    expect(out.map((c) => c.price)).toEqual([5]);
  });
});
