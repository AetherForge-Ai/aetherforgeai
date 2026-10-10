import { describe, expect, it } from "vitest";
import { paperAddAction, paperAddReturnPath, paperAddSignupHref } from "@/lib/paper-add-link";

describe("paper add guest vs member", () => {
  it("opens the panel for a member and sends a guest to sign-up", () => {
    expect(paperAddAction(true, { coinId: "bitcoin", market: "Crypto" })).toEqual({ kind: "panel" });
    const guest = paperAddAction(false, { coinId: "bitcoin", symbol: "BTC", name: "Bitcoin", market: "Crypto" });
    expect(guest.kind).toBe("signup");
    if (guest.kind !== "signup") return;
    expect(guest.href).toBe(`/register?redirect=${encodeURIComponent("/markets/crypto/bitcoin?buy=1")}`);
    expect(guest.href).not.toContain("openRecordTransaction");
  });

  it("keeps the coin and the DEX badge on the return path", () => {
    expect(paperAddReturnPath({ coinId: "bonk", market: "DEX" })).toBe(
      "/markets/crypto/bonk?buy=1&market=dex",
    );
    const href = paperAddSignupHref({ coinId: "bonk", market: "DEX" });
    expect(decodeURIComponent(href.replace("/register?redirect=", ""))).toBe(
      "/markets/crypto/bonk?buy=1&market=dex",
    );
  });

  it("sends a DEX token with no CoinGecko id to the unavailable page", () => {
    const back = paperAddReturnPath({ symbol: "BULL", name: "BULL", market: "DEX", coinId: "eth_0xabc" });
    expect(back.startsWith("/markets/crypto/unavailable?")).toBe(true);
    expect(back).toContain("symbol=BULL");
    expect(back).toContain("name=BULL");
    expect(back).toContain("buy=1");
    expect(back).toContain("market=dex");
    expect(paperAddAction(true, { symbol: "BULL", market: "DEX" })).toEqual({ kind: "panel" });
  });
});
