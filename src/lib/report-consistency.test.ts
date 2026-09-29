import { describe, expect, it } from "vitest";
import { buildLiveReport } from "@/lib/apex";
import { buildIntelligenceBriefing } from "@/lib/briefing";
import type { SecurityIntel } from "@/lib/market-intel";
import { reconcileStoredReport } from "@/lib/report-book";
import {
  alignedProjection,
  candidateIsSuitable,
  deploymentGuard,
  narrativeContradictsCanonical,
  rateAsset,
  readTape,
  sanitizeGuardedCashText,
  sanitizeGuardedReport,
  urgesFullDeployment,
  violatesCashGuard,
} from "@/lib/report-consistency";

function intel(partial: Partial<SecurityIntel> & Pick<SecurityIntel, "ticker">): SecurityIntel {
  const low = partial.outlook?.base.lowPct ?? -2.83;
  const high = partial.outlook?.base.highPct ?? 2.87;
  const expected = partial.outlook?.expectedPct ?? 0.02;
  return {
    ticker: partial.ticker,
    name: partial.name ?? partial.ticker,
    sector: "Test",
    market: partial.market ?? "NZX",
    assetClass: partial.assetClass ?? "stock",
    currency: partial.currency ?? "NZD",
    price: partial.price ?? 10,
    change1d: partial.change1d ?? 0.4,
    change7d: partial.change7d ?? 1.2,
    change30d: partial.change30d ?? 3,
    history: partial.history ?? [{ label: "Now", price: partial.price ?? 10 }],
    projection: [],
    projected7dPct: partial.projected7dPct ?? expected,
    confidence: partial.confidence ?? 50,
    rsi: partial.rsi ?? 55,
    macd: 0.1,
    macdSignalLine: 0,
    macdHistogram: 0.1,
    macdSignal: partial.macdSignal ?? "Neutral",
    bbPosition: 50,
    sma20: 10,
    vsSma20: 0,
    sma50: 10,
    vsSma50: 0,
    atrPct: 1,
    realizedVolPct: 20,
    dailyVolPct: 1,
    regime: partial.regime ?? "Range-Bound",
    support: 9,
    resistance: 11,
    pivot: 10,
    outlook: partial.outlook ?? {
      horizonDays: 7,
      expectedPct: expected,
      sigma7Pct: 2,
      regime: partial.regime ?? "Range-Bound",
      base: { label: "Base", lowPct: low, highPct: high, lowPrice: 9, highPrice: 11, probability: 50 },
      bull: { label: "Bull", lowPct: 3, highPct: 6, lowPrice: 11, highPrice: 12, probability: 25 },
      bear: { label: "Bear", lowPct: -6, highPct: -3, lowPrice: 8, highPrice: 9, probability: 25 },
    },
    signal: partial.signal ?? "Hold",
    score: partial.score ?? 52,
    conviction: partial.conviction ?? "Moderate",
    convictionReason: "test",
    reasoning: "test",
  };
}

const neutralTape = { bias: "Neutral" as const, level: "Speculative" as const, score: 54, averageConfidence: 42 };

describe("canonical ratings", () => {
  it("keeps a bullish MACD buy as the only positive-momentum rating", () => {
    const fph = rateAsset({ signal: "Buy", macdSignal: "Bullish", regime: "Range-Bound" });
    expect(fph).toEqual({ action: "BUY", cardSignal: "Buy", positiveMomentum: true });
  });

  it("will not call a bearish downtrend a buy", () => {
    const eth = rateAsset({ signal: "Strong Buy", macdSignal: "Bearish", regime: "Trending Down" });
    expect(eth.action).toBe("HOLD");
    expect(eth.cardSignal).toBe("Hold");
    expect(eth.positiveMomentum).toBe(false);
  });

  it("holds a buy whose MACD is bearish even outside a downtrend", () => {
    expect(rateAsset({ signal: "Buy", macdSignal: "Bearish", regime: "Range-Bound" }).action).toBe("HOLD");
  });

  it("quotes one midpoint inside one base range", () => {
    const aligned = alignedProjection(
      intel({ ticker: "FPH.NZ", outlook: undefined })
    );
    expect(aligned.pct).toBe(0.02);
    expect(aligned.range).toBe("-2.83% to +2.87%");
  });
});

describe("cash deployment guard", () => {
  it("caps a neutral speculative tape and refuses the full cash balance", () => {
    const guard = deploymentGuard("stock", neutralTape, 12696);
    expect(guard.mode).toBe("starter");
    expect(guard.maxDeployFraction).toBe(0.25);
    expect(guard.headline).toMatch(/Do not deploy the full cash balance/);
    expect(guard.headline).toMatch(/12,696/);
    expect(
      candidateIsSuitable(
        { signal: "Strong Buy", macdSignal: "Bullish", regime: "Trending Up", conviction: "Speculative", projected7dPct: 27 },
        guard
      )
    ).toBe(false);
  });

  it("does not treat the guard sentence itself as a full-cash instruction", () => {
    const guard = deploymentGuard("crypto", { bias: "Neutral", level: "Low", score: 49, averageConfidence: 40 }, 680);
    expect(urgesFullDeployment(guard.headline)).toBe(false);
    expect(urgesFullDeployment("Deploy the full cash balance into GALA.")).toBe(true);
    expect(
      narrativeContradictsCanonical(
        "HOLD ETH. 0 of 1 assets carry a positive momentum signal. Do not deploy the full cash balance.",
        [{ ticker: "ETH", action: "HOLD" }],
        guard,
        { positive: 0, total: 1 }
      )
    ).toBe(false);
    expect(
      narrativeContradictsCanonical(
        "ETH is a Strong Buy. 1 of 1 assets carry a positive momentum signal. Deploy the full cash into alts.",
        [{ ticker: "ETH", action: "HOLD" }],
        guard,
        { positive: 0, total: 1 }
      )
    ).toBe(true);
  });
});

const STOX_STORED =
  "On the live book, HOLD AAPL (NASDAQ; RSI 27.1, MACD Bearish, High Volatility; 50% odds of a -7.09% to +10.77% 7-day band) and ADD FPH.NZ (NZX; RSI 61.9, MACD Bullish, Range-Bound; 50% odds of -2.83% to +2.87% at 60% Moderate conviction). " +
  "The 7-day tape is a Neutral-bias, Speculative 54/100 regime with Neutral 50/100 sentiment. " +
  "The single highest-impact action now is to ACCUMULATE the NZ$12,696 cash into CIP.AX and MAH.AX at high Speculative conviction. " +
  "Secondary BUY names: WOR.AX and MAR (Buy) sit at Speculative-to-Moderate conviction aligned to the 54/100 net read.";

const KOINS_STORED =
  "Global digital assets are Neutral / low conviction (net 49/100). Deploy NZ$12,696 cash to BUY/ACCUMULATE GALA, SKL, ARB, ANKR and SHIB.";

describe("stored reports cannot keep a full-cash deploy", () => {
  const guard = deploymentGuard("stock", neutralTape, 12696);

  it("treats a named cash balance as a full deploy under a 54 speculative tape", () => {
    expect(urgesFullDeployment(STOX_STORED)).toBe(true);
    expect(urgesFullDeployment(KOINS_STORED)).toBe(true);
    expect(violatesCashGuard(guard.headline)).toBe(false);
    expect(
      narrativeContradictsCanonical(
        STOX_STORED,
        [
          { ticker: "AAPL", action: "HOLD" },
          { ticker: "FPH.NZ", action: "BUY" },
        ],
        guard
      )
    ).toBe(true);
    expect(
      narrativeContradictsCanonical(
        KOINS_STORED,
        [{ ticker: "ETH", action: "HOLD" }],
        deploymentGuard("crypto", { bias: "Neutral", level: "Low", score: 49, averageConfidence: 40 }, 12696)
      )
    ).toBe(true);
  });

  it("strips the cash-deploy sentences when an old report is opened", () => {
    const cleaned = sanitizeGuardedReport({
      bot: "stock",
      executiveSummary: STOX_STORED,
      briefing: {
        overall: { bias: "Neutral", level: "Speculative", score: 54 },
        executiveSummary: STOX_STORED,
      },
      keyObservations: ["1 of 3 holdings carry a positive momentum signal."],
      pathwayPlan: { recommendationNote: "ACCUMULATE the NZ$12,696 cash into CIP.AX and MAH.AX." },
      directRecommendations: [{ detail: "Buy CIP.AX — deploy NZ$12,696 cash at high Speculative conviction." }],
    });
    expect(cleaned.executiveSummary).toMatch(/HOLD AAPL/);
    expect(cleaned.executiveSummary).toMatch(/FPH\.NZ/);
    expect(cleaned.executiveSummary).toMatch(/-2\.83% to \+2\.87%/);
    expect(cleaned.executiveSummary).not.toMatch(/ACCUMULATE the NZ\$12,696 cash/i);
    expect(cleaned.executiveSummary).not.toMatch(/CIP\.AX/);
    expect(cleaned.executiveSummary).toMatch(/Do not deploy the full cash balance/);
    expect(cleaned.executiveSummary).toMatch(/12,696/);
    expect(cleaned.briefing?.executiveSummary).not.toMatch(/ACCUMULATE the NZ\$12,696 cash/i);
    expect(cleaned.pathwayPlan?.recommendationNote).not.toMatch(/ACCUMULATE the NZ\$12,696 cash/i);
    expect(cleaned.directRecommendations?.[0]?.detail).not.toMatch(/NZ\$12,696 cash/i);
    expect(cleaned.keyObservations?.[0]).toMatch(/1 of 3/);
    expect(sanitizeGuardedReport(cleaned).executiveSummary).toBe(cleaned.executiveSummary);

    const koins = sanitizeGuardedCashText(KOINS_STORED, "crypto");
    expect(koins).not.toMatch(/Deploy NZ\$12,696 cash/i);
    expect(koins).not.toMatch(/BUY\/ACCUMULATE GALA/i);
    expect(koins).toMatch(/Do not deploy the full cash balance/);
    expect(koins).toMatch(/Neutral/);
    expect(sanitizeGuardedCashText(koins, "crypto")).toBe(koins);
  });

  it("sanitizes a stored payload on the view path", () => {
    const stored = reconcileStoredReport(
      {
        bot: "stock",
        executiveSummary: STOX_STORED,
        briefing: {
          overall: { bias: "Neutral", level: "Speculative", score: 54 },
          executiveSummary: STOX_STORED,
        },
        keyObservations: ["Live book: AAPL, FPH.NZ."],
        pathwayPlan: { recommendationNote: "ACCUMULATE the NZ$12,696 cash into CIP.AX." },
      },
      [
        { ticker: "AAPL", shares: 2 },
        { ticker: "FPH.NZ", shares: 5 },
      ]
    );
    expect(stored.executiveSummary).toMatch(/HOLD AAPL/);
    expect(stored.executiveSummary).not.toMatch(/ACCUMULATE the NZ\$12,696 cash/i);
    expect(stored.pathwayPlan?.recommendationNote).not.toMatch(/ACCUMULATE the NZ\$12,696 cash/i);
    expect(stored.executiveSummary).toMatch(/Do not deploy the full cash balance/);
  });

  it("strips the exact live View phrases, including markdown and comma-less dry powder", () => {
    const stoxSummary =
      "On the live book, **HOLD AAPL** (NASDAQ; RSI 27.1, MACD Bearish). The tape is a Neutral-bias, Speculative 54/100 regime. " +
      "The single highest-impact action now is to **ACCUMULATE the NZ$12,696 cash into CIP.AX and MAH.AX** at high Speculative conviction. " +
      "Secondary BUY names: WOR.AX, PFI.NZ, NST.AX and CIP.AX.";
    const koinsSummary =
      "Global digital assets are Neutral / low conviction (net 49/100). After that held-book action, **deploy NZ$12,696 cash to BUY/ACCUMULATE** on the crypto market GALA, SKL, ARB, ANKR, SHIB and QNT. " +
      "The single highest-impact action now is HOLD ETH and ACCUMULATE GALA with a measured cash slice.";
    const dry = (ticker: string, action: "BUY" | "ACCUMULATE") =>
      `${action === "BUY" ? "Buy" : "Accumulate"} **${ticker}** — screens **${action === "BUY" ? "Buy" : "Strong Buy"}** with a +0.94% 7-day projection at **87%** conviction. Deploy dry powder (cash NZ$12696 available) with a measured starter size.`;

    expect(urgesFullDeployment("**ACCUMULATE the NZ$12,696 cash into CIP.AX and MAH.AX**")).toBe(true);
    expect(urgesFullDeployment("**deploy NZ$12,696 cash to BUY/ACCUMULATE**")).toBe(true);
    expect(urgesFullDeployment(dry("WOR.AX", "BUY"))).toBe(true);
    expect(violatesCashGuard(deploymentGuard("stock", neutralTape, 12696).headline)).toBe(false);

    const stox = sanitizeGuardedReport({
      bot: "stock",
      executiveSummary: stoxSummary,
      briefing: {
        overall: { bias: "Neutral", level: "Speculative", score: 54, reason: stoxSummary },
        executiveSummary: stoxSummary,
        highlights: ["**ACCUMULATE the NZ$12,696 cash into CIP.AX and MAH.AX**"],
      },
      directRecommendations: [
        { ticker: "FPH.NZ", held: true, action: "BUY", detail: "Buy FPH.NZ — constructive momentum with a +0.02% 7-day projection. A measured top-up is warranted." },
        ...["WOR.AX", "PFI.NZ", "NST.AX", "CIP.AX", "SFR.AX", "LIN", "DOW.AX"].map((ticker) => ({
          ticker,
          held: false as const,
          action: "BUY" as const,
          detail: dry(ticker, "BUY"),
        })),
      ],
    });
    const stoxBlob = [
      stox.executiveSummary,
      stox.briefing?.executiveSummary,
      stox.briefing?.overall?.reason,
      ...(stox.briefing?.highlights ?? []),
      ...(stox.directRecommendations ?? []).map((rec) => rec.detail),
    ].join("\n");
    expect(stox.executiveSummary).toMatch(/HOLD AAPL/);
    expect(stoxBlob).not.toMatch(/ACCUMULATE the NZ\$12,696 cash/i);
    expect(stoxBlob).not.toMatch(/Secondary BUY names/i);
    expect(stoxBlob).not.toMatch(/dry powder/i);
    expect(stoxBlob).not.toMatch(/NZ\$12696/);
    expect(stoxBlob).not.toMatch(/cash NZ\$12,696/i);
    expect(stox.directRecommendations?.some((rec) => rec.ticker === "FPH.NZ")).toBe(true);
    expect(stox.directRecommendations?.filter((rec) => rec.held === false)).toHaveLength(2);
    expect(stox.executiveSummary).toMatch(/Do not deploy the full cash balance/);

    const koins = sanitizeGuardedCashText(koinsSummary, "crypto");
    expect(koins).toMatch(/HOLD ETH/);
    expect(koins).not.toMatch(/deploy NZ\$12,696 cash to BUY\/ACCUMULATE/i);
    expect(koins).not.toMatch(/measured cash slice/i);
    expect(koins).toMatch(/Do not deploy the full cash balance/);

    const viewed = reconcileStoredReport(
      {
        bot: "crypto",
        executiveSummary: koinsSummary,
        briefing: { overall: { bias: "Neutral", level: "Low", score: 49 }, executiveSummary: koinsSummary },
        directRecommendations: [
          { ticker: "ETH", held: true, action: "HOLD", detail: "Hold ETH — no decisive edge this week." },
          { ticker: "TRX", held: false, action: "BUY", detail: dry("TRX", "BUY") },
          { ticker: "ROSE", held: false, action: "ACCUMULATE", detail: dry("ROSE", "ACCUMULATE") },
          { ticker: "WIF", held: false, action: "BUY", detail: dry("WIF", "BUY") },
        ],
      },
      [{ ticker: "ETH", shares: 0.25 }]
    );
    const viewedBlob = [viewed.executiveSummary, ...(viewed.directRecommendations ?? []).map((rec) => rec.detail ?? "")].join("\n");
    expect(viewedBlob).not.toMatch(/deploy NZ\$12,696 cash/i);
    expect(viewedBlob).not.toMatch(/dry powder/i);
    expect(viewedBlob).not.toMatch(/NZ\$12696/);
    expect(viewed.directRecommendations?.filter((rec) => rec.held === false).length).toBeLessThanOrEqual(2);
  });

  it("strips the exact retest strings, including split bold, decimals, and a constructive overall", () => {
    const stoxSummary =
      "On the live book, **HOLD AAPL** (NASDAQ; RSI 27.1, MACD Bearish, High Volatility; 50% odds of a **-7.09% to +10.77%** 7-day band at 50% confidence), **HOLD BHP.AX** (ASX; RSI 41.4, MACD Bearish), and **ADD FPH.NZ** (NZX; RSI 61.9; 50% odds of **-2.83% to +2.87%** at 60% Moderate conviction). " +
      "The 7-day NZX/ASX/NASDAQ/Dow tape is a Neutral-bias, Speculative 54/100 regime with Neutral 50/100 sentiment. " +
      "The single highest-impact action now is to **ACCUMULATE** the **NZ$12,696 cash** into **CIP.AX** (ASX; +2.52% 7d projection, highest full-market sweep alpha) and **MAH.AX** (ASX; +5.56% 7d projected leader, Buy) at high Speculative conviction. " +
      "Secondary **BUY** names: **WOR.AX** (ASX, +0.94% 7d) for industrial momentum.";
    const dryWor =
      "Buy **WOR.AX** (Worley, ASX) — screens **Buy** with a +0.94% 7-day projection at **87%** conviction. Deploy dry powder (cash NZ$12696 available) with a measured starter size.";
    const koinsSummary =
      "ETH is a **HOLD** (0.25 @ $2,730.56 vs $2,717.05 cost): regime Trending Down, RSI 29.9 oversold, MACD Bearish, 7-day base-case **-4.61% to +3.69%** (50% odds) at 78% confidence, and no sell flag — do not add or trim into Friday NFP. " +
      "After that held-book action, deploy **NZ$12,696 cash** to **BUY/ACCUMULATE** on the crypto market GALA (Strong Buy, +28.27% 7d proj), SKL, ARB and ANKR. " +
      "Global digital assets are Neutral / low conviction (net 49/100). " +
      "The single highest-impact action now is **HOLD ETH and ACCUMULATE GALA, SKL, ARB and ANKR with a measured cash slice before NFP**.";
    const dryTrx =
      "Buy **TRX** (TRX, CRYPTO) — screens **Buy** with a +2.18% 7-day projection at **96%** conviction. Deploy dry powder (cash NZ$12696 available) with a measured starter size.";
    const swallowed =
      "ETH is a **HOLD** and no sell flag — do not add or trim into Friday NFP — after that held-book action, deploy **NZ$12,696 cash** to **BUY/ACCUMULATE** GALA.";

    expect(urgesFullDeployment(stoxSummary)).toBe(true);
    expect(urgesFullDeployment(koinsSummary)).toBe(true);
    expect(urgesFullDeployment(dryWor)).toBe(true);
    expect(urgesFullDeployment(swallowed)).toBe(true);

    const stox = sanitizeGuardedReport({
      bot: "stock",
      executiveSummary: stoxSummary,
      briefing: {
        overall: { bias: "Constructive", level: "High", score: 80, reason: stoxSummary },
        executiveSummary: stoxSummary,
      },
      directRecommendations: [
        { ticker: "FPH.NZ", held: true, action: "BUY", detail: "Add to FPH.NZ — constructive momentum with a +0.02% 7-day projection. A measured top-up is warranted." },
        { ticker: "WOR.AX", held: false, action: "BUY", detail: dryWor },
      ],
      pathwayPlan: {
        recommendationNote: "Deploy dry powder (cash NZ$12696 available) into CIP.AX.",
        pathways: [{ summary: "Overweight CIP.AX.", steps: ["Deploy dry powder (cash NZ$12696 available) with a measured starter size."] }],
      },
    });
    const stoxBlob = [
      stox.executiveSummary,
      stox.briefing?.executiveSummary,
      stox.briefing?.overall?.reason,
      stox.pathwayPlan?.recommendationNote,
      ...(stox.pathwayPlan?.pathways ?? []).flatMap((p) => [p.summary, ...(p.steps ?? [])]),
      ...(stox.directRecommendations ?? []).map((rec) => rec.detail),
    ].join("\n");
    expect(stox.executiveSummary).toMatch(/HOLD AAPL/);
    expect(stox.executiveSummary).toMatch(/FPH\.NZ/);
    expect(stox.executiveSummary).toMatch(/-2\.83% to \+2\.87%/);
    expect(stoxBlob).not.toMatch(/NZ\$12,696 cash/i);
    expect(stoxBlob).not.toMatch(/NZ\$12696/);
    expect(stoxBlob).not.toMatch(/dry powder/i);
    expect(stoxBlob).not.toMatch(/\.52%/);
    expect(stoxBlob).not.toMatch(/ACCUMULATE/i);
    expect(stox.directRecommendations?.some((rec) => rec.ticker === "FPH.NZ")).toBe(true);
    expect(stox.directRecommendations?.find((rec) => rec.ticker === "WOR.AX")?.detail).toMatch(/Buy \*\*WOR\.AX\*\*/);
    expect(stox.executiveSummary).toMatch(/Do not deploy the full cash balance/);

    const koins = sanitizeGuardedReport({
      bot: "crypto",
      executiveSummary: koinsSummary,
      briefing: { overall: { bias: "Neutral", level: "Low", score: 49 }, executiveSummary: koinsSummary },
      directRecommendations: [
        { ticker: "ETH", held: true, action: "HOLD", detail: "Hold ETH — no decisive edge this week (7-day projection -0.46%). Maintain the position and monitor." },
        { ticker: "TRX", held: false, action: "BUY", detail: dryTrx },
      ],
    });
    const koinsBlob = [koins.executiveSummary, koins.briefing?.executiveSummary, ...(koins.directRecommendations ?? []).map((rec) => rec.detail ?? "")].join("\n");
    expect(koinsBlob).toMatch(/HOLD/);
    expect(koinsBlob).toMatch(/\$2,730\.56/);
    expect(koinsBlob).not.toMatch(/NZ\$12,696 cash/i);
    expect(koinsBlob).not.toMatch(/NZ\$12696/);
    expect(koinsBlob).not.toMatch(/dry powder/i);
    expect(koinsBlob).not.toMatch(/measured cash slice/i);
    expect(koinsBlob).not.toMatch(/BUY\/ACCUMULATE/i);
    expect(sanitizeGuardedCashText(swallowed, "crypto")).not.toMatch(/NZ\$12,696 cash/i);

    const hiddenOnConstructive = sanitizeGuardedReport({
      bot: "stock",
      executiveSummary: "Signals are constructive. Scale into quality names.",
      briefing: { overall: { bias: "Constructive", level: "High", score: 80 }, executiveSummary: "Signals are constructive. Scale into quality names." },
      directRecommendations: [{ ticker: "WOR.AX", held: false, action: "BUY", detail: dryWor }],
    });
    expect(hiddenOnConstructive.directRecommendations?.[0]?.detail).not.toMatch(/dry powder/i);
    expect(hiddenOnConstructive.directRecommendations?.[0]?.detail).not.toMatch(/NZ\$12696/);
    expect(hiddenOnConstructive.executiveSummary).toMatch(/Scale into quality/);

    const untouched = sanitizeGuardedReport({
      bot: "stock",
      executiveSummary: "Constructive tape. Scale into quality names.",
      briefing: { overall: { bias: "Constructive", level: "High", score: 80 } },
      directRecommendations: [{ held: false, action: "BUY", detail: "Buy FPH.NZ — starter size only." }],
    });
    expect(untouched.executiveSummary).toBe("Constructive tape. Scale into quality names.");
    expect(untouched.directRecommendations?.[0]?.detail).toBe("Buy FPH.NZ — starter size only.");
  });
});

describe("live report uses one rating", () => {
  const fph = intel({
    ticker: "FPH.NZ",
    name: "Fisher & Paykel Healthcare",
    signal: "Buy",
    macdSignal: "Bullish",
    regime: "Range-Bound",
    conviction: "Moderate",
    score: 61,
  });
  const aapl = intel({
    ticker: "AAPL",
    name: "Apple",
    market: "US",
    currency: "USD",
    signal: "Hold",
    macdSignal: "Bearish",
    regime: "High Volatility",
    score: 48,
  });
  const bhp = intel({
    ticker: "BHP.AX",
    name: "BHP",
    market: "ASX",
    currency: "AUD",
    signal: "Hold",
    macdSignal: "Neutral",
    regime: "High Volatility",
    score: 47,
  });
  const gala = intel({
    ticker: "GALA",
    name: "Gala",
    market: "CRYPTO",
    assetClass: "crypto",
    currency: "USD",
    signal: "Strong Buy",
    macdSignal: "Bullish",
    regime: "High Volatility",
    conviction: "Speculative",
    projected7dPct: 27.5,
    score: 80,
    confidence: 70,
  });

  it("aligns Stox cards, counts, ranges, and cash advice", () => {
    const report = buildLiveReport(
      "stock",
      [
        { ticker: "AAPL", name: "Apple", price: 180, shares: 2, purchasePrice: 170 },
        { ticker: "BHP.AX", name: "BHP", price: 40, shares: 10, purchasePrice: 38 },
        { ticker: "FPH.NZ", name: "Fisher & Paykel Healthcare", price: 36, shares: 5, purchasePrice: 34 },
      ],
      { holdingIntel: [aapl, bhp, fph], tape: neutralTape, cashBalanceNZD: 12696, universeIntel: [gala] }
    );
    const fphCard = report.tickers.find((t) => t.ticker === "FPH.NZ");
    const fphRec = report.directRecommendations.find((r) => r.ticker === "FPH.NZ");
    expect(fphCard?.signal).toBe("Buy");
    expect(fphCard?.note).toContain("BUY");
    expect(fphCard?.note).toContain("-2.83% to +2.87%");
    expect(fphCard?.note).toContain("+0.02%");
    expect(fphRec?.action).toBe("BUY");
    expect(fphRec?.detail).toContain("-2.83% to +2.87%");
    expect(fphRec?.detail).toContain("+0.02%");
    expect(report.executiveSummary).toMatch(/1 of 3/);
    expect(report.executiveSummary).toContain("BUY FPH.NZ");
    expect(report.executiveSummary).toContain("-2.83% to +2.87%");
    expect(report.keyObservations.join(" ")).toMatch(/1 of 3/);
    expect(report.executiveSummary).toMatch(/Do not deploy the full cash balance/);
    expect(report.pathwayPlan.recommendationNote).toMatch(/Do not deploy the full cash balance/);
    expect(report.directRecommendations.some((r) => r.ticker === "GALA")).toBe(false);
    expect(report.executiveSummary).toMatch(/GALA/);
    const daySum = (fphCard?.shortTerm ?? []).reduce((s, d) => s + d.movePct, 0);
    expect(Math.round(daySum * 100) / 100).toBe(0.02);
  });

  it("keeps ETH a hold when the tape and MACD are bearish", () => {
    const eth = intel({
      ticker: "ETH",
      name: "Ethereum",
      market: "CRYPTO",
      assetClass: "crypto",
      currency: "USD",
      signal: "Strong Buy",
      macdSignal: "Bearish",
      regime: "Trending Down",
      conviction: "Low",
      score: 44,
      rsi: 29.9,
    });
    const tape = readTape([eth]);
    const report = buildLiveReport(
      "crypto",
      [{ ticker: "ETH", name: "Ethereum", price: 2700, shares: 0.25, purchasePrice: 2730 }],
      { holdingIntel: [eth], tape, cashBalanceNZD: 0, universeIntel: [gala] }
    );
    expect(report.tickers[0]?.signal).toBe("Hold");
    expect(report.tickers[0]?.note).toContain("HOLD");
    expect(report.tickers[0]?.note).toContain("This is not a positive-momentum rating.");
    expect(report.directRecommendations.find((r) => r.ticker === "ETH")?.action).toBe("HOLD");
    expect(report.executiveSummary).toMatch(/0 of 1/);
    expect(report.executiveSummary).toContain("HOLD ETH");
    expect(report.directRecommendations.some((r) => r.ticker === "GALA" && (r.action === "BUY" || r.action === "ACCUMULATE"))).toBe(false);

    const briefing = buildIntelligenceBriefing({
      bot: "crypto",
      marketLabel: "Crypto",
      technicals: [eth],
      events: [],
      sentiment: { label: "Neutral", score: 50, bullish: 0, bearish: 0, neutral: 0, method: "keyword", headlines: [] },
    });
    expect(briefing.executiveSummary).toMatch(/0 of 1/);
    expect(briefing.executiveSummary).toContain("HOLD ETH");
    expect(briefing.outlook[0]?.signal).toBe("Hold");
    expect(briefing.keyObservations.join(" ")).toMatch(/0 of 1/);
  });
});
