import { describe, expect, it } from "vitest";
import { PUBLIC_ADVICE_LEAK, technicalSnapshot, toPublicPayload } from "./public-intel";

describe("public market payloads", () => {
  it("drops ratings, conviction and sizing language", () => {
    const payload = toPublicPayload({
      universe: [
        {
          ticker: "AIR.NZ",
          market: "NZX",
          rsi: 28,
          vsSma20: -3.2,
          regime: "High Volatility",
          dailyVolPct: 3.4,
          signal: "Strong Buy",
          conviction: "Speculative",
          convictionReason: "elevated realised volatility widens the outcome range — size positions small",
          reasoning: "Strong Buy · RSI 10 is oversold — mean-reversion setup. 7-day model projects +55%.",
          macdSignal: "Bullish",
        },
        {
          ticker: "BHP.AX",
          market: "ASX",
          rsi: 74,
          vsSma20: 2,
          regime: "Trending Up",
          signal: "Sell",
          conviction: "High",
          convictionReason: "strong directional edge",
          reasoning: "Sell · MACD histogram is negative.",
        },
      ],
      news: [{ headline: "Fed may Reduce rates", summary: "Traders sell into the print. Strong Buy chatter." }],
    });

    const json = JSON.stringify(payload);
    expect(json).not.toMatch(PUBLIC_ADVICE_LEAK);
    expect(json).not.toMatch(/size positions/i);
    expect(json).toContain("Technical snapshot:");
    expect(json).toContain("oversold");
    expect(json).toContain("above its 20-day average");
    expect(technicalSnapshot({ rsi: 10, vsSma20: -4, regime: "High Volatility" })).toBe(
      "Technical snapshot: RSI 10 (oversold), below its 20-day average. Volatility: high.",
    );
  });
});
