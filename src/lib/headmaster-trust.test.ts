import { describe, expect, it, vi, afterEach } from "vitest";
import { buildStrategy, buildSynthesis, CLASS_META } from "@/lib/totalum-engine";
import {
  alignNarrativeToPlan,
  ASSISTANT_TURN_TIMEOUT_MS,
  buildAllocationPlan,
  createTurnController,
  describeTurnFailure,
  executiveBriefFromPlan,
  illustrativeActionLabel,
  intelligenceBriefInstructions,
  requestsWatchlist,
  scopeHeadmasterIdeas,
  softenHeadmasterLanguage,
  turnProgressLabel,
  type PlanAssetClass,
} from "@/lib/headmaster-trust";

const EXAM_TOTAL = 19940;
const EXAM_CASH = 11048;

function examPlan() {
  const classes: PlanAssetClass[] = ["equities", "crypto", "metals", "cash"];
  const values: Record<PlanAssetClass, number> = {
    equities: 5005,
    crypto: 1236,
    metals: 2651,
    cash: EXAM_CASH,
  };
  return buildAllocationPlan({
    totalValueNZD: EXAM_TOTAL,
    cashBalanceNZD: EXAM_CASH,
    classes: classes.map((key) => ({
      assetClass: key,
      label: CLASS_META[key].label,
      color: CLASS_META[key].color,
      valueNZD: values[key],
    })),
    targets: { equities: 55, crypto: 20, metals: 15, cash: 10 },
    modelName: "Balanced Growth",
    riskLabel: "Balanced",
    projectedReturnPct: 12.7,
    projectedVolPct: 26,
  });
}

describe("Headmaster allocation plan", () => {
  it("uses one cash identity for the exam book instead of deploying the full balance", () => {
    const plan = examPlan();
    const retained = Math.round(EXAM_TOTAL * 0.1);
    const reallocation = EXAM_CASH - retained;
    const cash = plan.moves.find((m) => m.assetClass === "cash")!;

    expect(plan.retainedCashNZD).toBe(retained);
    expect(plan.retainedCashNZD).toBe(1994);
    expect(plan.cashToReallocateNZD).toBe(reallocation);
    expect(plan.cashToReallocateNZD).toBe(9054);
    expect(plan.cashToReallocateNZD).not.toBe(plan.cashOnBookNZD);
    expect(cash.action).toBe("reduce");
    expect(cash.amountNZD).toBe(plan.cashToReallocateNZD);
    expect(plan.cashOnBookNZD - plan.cashToReallocateNZD).toBe(plan.retainedCashNZD);

    const signed = plan.moves.reduce((sum, m) => sum + m.deltaNZD, 0);
    expect(signed).toBe(0);
    expect(plan.illustrativeIncreaseNZD).toBe(plan.illustrativeReduceNZD);
    expect(plan.illustrativeReduceNZD).toBe(plan.cashToReallocateNZD);
    expect(plan.reconciled).toBe(true);

    const brief = executiveBriefFromPlan(plan);
    expect(brief).toContain("NZ$1,994");
    expect(brief).toContain("NZ$9,054");
    expect(brief).toContain("NZ$11,048");
    expect(brief).not.toMatch(/deploy the NZ\$11,048/i);
    expect(brief).not.toMatch(/dry powder/i);
    expect(brief).toMatch(/does not trade for you/i);
    expect(plan.narrative).toBe(brief);
    expect(plan.formula).toMatch(/11,048 − retained cash NZ\$1,994/);
    expect(plan.formula).toContain("NZ$9,054");
  });

  it("keeps strategy table, narrative, and rules on that same plan and off buy orders", () => {
    const syn = buildSynthesis({
      stocks: [
        {
          _id: "aapl",
          ticker: "AAPL",
          asset_type: "stock",
          company_name: "Apple",
          shares: 10,
          purchase_price: 100,
          current_price: 200,
        },
        {
          _id: "eth",
          ticker: "ETH",
          asset_type: "crypto",
          company_name: "Ether",
          shares: 1,
          purchase_price: 1000,
          current_price: 1500,
        },
      ],
      metals: [],
      spot: {
        gold: { nzdPerOz: 4000, usdPerOz: 2400 },
        silver: { nzdPerOz: 50, usdPerOz: 30 },
        live: true,
        asOf: "2026-09-30T00:00:00.000Z",
      },
      fxToNZD: { NZD: 1, USD: 1, AUD: 1 },
      cashBalanceNZD: 8000,
    });
    const strategy = buildStrategy(syn, "balanced_growth");
    const cash = strategy.rebalance.find((m) => m.assetClass === "cash")!;
    const signed = strategy.rebalance.reduce((sum, m) => {
      if (m.action === "reduce") return sum - m.amountNZD;
      if (m.action === "increase") return sum + m.amountNZD;
      return sum;
    }, 0);

    expect(strategy.plan.reconciled).toBe(true);
    expect(signed).toBe(0);
    expect(cash.amountNZD).toBe(
      cash.action === "reduce" ? strategy.plan.cashToReallocateNZD : strategy.plan.moves.find((m) => m.assetClass === "cash")!.amountNZD
    );
    expect(strategy.narrative).toContain("NZ$");
    expect(strategy.narrative).toMatch(/retained/i);
    expect(strategy.narrative).not.toMatch(/deploy the NZ\$/i);

    const blob = [
      strategy.narrative,
      strategy.formula,
      ...strategy.entryRules,
      ...strategy.exitRules,
      ...strategy.rebalance.map((m) => illustrativeActionLabel(m.action)),
    ].join("\n");
    expect(blob).not.toMatch(/BUY\/ACCUMULATE|ACCUMULATE|Strong Buy|\bBUY\b/i);
    expect(blob).not.toMatch(/Buy ▲|Trim ▼/);
    expect(strategy.entryRules.join(" ")).toMatch(/not an amount to deploy/i);
    expect(strategy.exitRules.join(" ")).not.toMatch(/hard stop-loss/i);
  });
});

describe("Headmaster language and holdings scope", () => {
  it("rewrites imperative buy lines and full-cash deployment onto the plan", () => {
    const plan = examPlan();
    const raw =
      "BUY/ACCUMULATE equities now. BUY TRX. ADD FPH.NZ. ROSE screens Strong Buy. " +
      "The single highest-impact action is to deploy the NZ$11,048 dry powder.";
    const aligned = alignNarrativeToPlan(raw, plan);
    expect(aligned).not.toMatch(/BUY\/ACCUMULATE|\bBUY\b|ACCUMULATE|Strong Buy/i);
    expect(aligned).not.toMatch(/deploy the NZ\$11,048/i);
    expect(aligned).not.toMatch(/dry powder/i);
    expect(aligned).toContain("NZ$9,054");
    expect(aligned).toContain("NZ$1,994");
    expect(aligned).toMatch(/illustrative/i);
    expect(softenHeadmasterLanguage("Keep the analysis of volatility at 11.4%.")).toMatch(/11\.4%/);
  });

  it("keeps non-held tickers out of the default scope and labels watchlist ideas", () => {
    const ideas = [
      { ticker: "AAPL", name: "Apple", market: "Stox", held: true, reason: "Held name." },
      { ticker: "FPH.NZ", name: "Fisher & Paykel", market: "Stox", held: true },
      { ticker: "ROSE", name: "Rose", market: "Koins", held: false, reason: "BUY ROSE at 84% Strong Buy." },
      { ticker: "CHZ", name: "Chiliz", market: "Koins", held: false, reason: "ACCUMULATE CHZ." },
    ];
    const held = scopeHeadmasterIdeas(ideas, ["AAPL", "FPH.NZ", "ETH"], false);
    expect(held.watchlist).toHaveLength(0);
    expect(held.contextBlock).not.toMatch(/\bROSE\b|\bCHZ\b/);
    expect(held.contextBlock).toMatch(/AAPL/);
    expect(held.contextBlock).toMatch(/withheld/);
    expect(held.contextBlock).not.toMatch(/\bBUY\b|ACCUMULATE|Strong Buy/);

    const asked = scopeHeadmasterIdeas(ideas, ["AAPL", "FPH.NZ"], true);
    expect(asked.watchlist.map((w) => w.ticker)).toEqual(["ROSE", "CHZ"]);
    expect(asked.contextBlock).toMatch(/WATCHLIST IDEAS/);
    expect(asked.contextBlock).toMatch(/not held/i);
    expect(asked.contextBlock).toMatch(/not an instruction/i);
    expect(asked.contextBlock).not.toMatch(/\bBUY\b|ACCUMULATE|Strong Buy/);

    expect(requestsWatchlist("What's my biggest risk right now?")).toBe(false);
    expect(requestsWatchlist("Show a watchlist of names I don't hold")).toBe(true);
  });

  it("tells the intelligence brief to use the plan figures and held names only", () => {
    const plan = examPlan();
    const prompt = intelligenceBriefInstructions({
      plan,
      heldTickers: ["AAPL", "FPH.NZ", "ETH", "TRX"],
      findingsContext: "Headmaster scope: current holdings only.",
      includeWatchlist: false,
    });
    expect(prompt).toContain("NZ$9,054");
    expect(prompt).toContain("NZ$1,994");
    expect(prompt).toMatch(/Do not tell the reader to deploy the full cash balance/);
    expect(prompt).toMatch(/Do not use BUY, ACCUMULATE, or Strong Buy/);
    expect(prompt).toMatch(/Do not name any ticker that is not in the current holdings/);
    expect(prompt).not.toMatch(/BUY\/ACCUMULATE/);
  });
});

describe("assistant turn recovery", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("times out instead of hanging, and cancel does not look like a timeout", () => {
    expect(ASSISTANT_TURN_TIMEOUT_MS).toBeGreaterThanOrEqual(10_000);
    expect(ASSISTANT_TURN_TIMEOUT_MS).toBeLessThanOrEqual(45_000);
    expect(turnProgressLabel(4)).toMatch(/Working… 4s/);
    expect(describeTurnFailure("timeout")).toMatch(/timed out/i);
    expect(describeTurnFailure("timeout")).toMatch(/still in the box/i);
    expect(describeTurnFailure("cancelled")).toMatch(/Cancelled/);
    expect(describeTurnFailure("error", "Network")).toMatch(/Network/);

    vi.useFakeTimers();
    const timed = createTurnController(1000);
    expect(timed.signal.aborted).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(timed.timedOut).toBe(true);
    expect(timed.signal.aborted).toBe(true);

    const cancelled = createTurnController(1000);
    cancelled.cancel();
    expect(cancelled.timedOut).toBe(false);
    expect(cancelled.signal.aborted).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(cancelled.timedOut).toBe(false);
  });
});
