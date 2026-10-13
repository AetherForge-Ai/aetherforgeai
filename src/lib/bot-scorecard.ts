/**
 * Public measured scorecard for Stox and Koins.
 * Figures come from the walk-forward check in docs/ai-bots-backtest.md.
 * They are counts on past delayed prices, not a promise about the next week.
 */

export interface ScorecardSide {
  bot: "Stox" | "Koins";
  testDecisions: number;
  testHitRate: string;
  alwaysUp: string;
  momentum: string;
  brierBefore: string;
  brierAfter: string;
  coverageBefore: string;
  coverageAfter: string;
  strategyPerWeek: string;
  buyHoldPerWeek: string;
  strategyDrawdown: string;
  buyHoldDrawdown: string;
  edge: string;
}

export const SCORECARD_WINDOW =
  "Delayed public daily closes, about five years through 12 Oct 2026. The test window starts 24 Oct 2024. Decisions do not overlap and do not use later prices.";

export const STOX_SCORECARD: ScorecardSide = {
  bot: "Stox",
  testDecisions: 2220,
  testHitRate: "50.1%",
  alwaysUp: "52.7%",
  momentum: "47.8%",
  brierBefore: "0.298",
  brierAfter: "0.250",
  coverageBefore: "51.6%",
  coverageAfter: "49.6%",
  strategyPerWeek: "−0.02%",
  buyHoldPerWeek: "+0.42%",
  strategyDrawdown: "−10.0%",
  buyHoldDrawdown: "−20.4%",
  edge: "No directional edge. The sign was right about half the time, which is worse than assuming the week finishes up.",
};

export const KOINS_SCORECARD: ScorecardSide = {
  bot: "Koins",
  testDecisions: 1020,
  testHitRate: "50.8%",
  alwaysUp: "45.3%",
  momentum: "46.7%",
  brierBefore: "0.317",
  brierAfter: "0.250",
  coverageBefore: "52.1%",
  coverageAfter: "50.4%",
  strategyPerWeek: "+0.16%",
  buyHoldPerWeek: "+0.42%",
  strategyDrawdown: "−31.3%",
  buyHoldDrawdown: "−72.1%",
  edge: "No edge we will claim. The fit window did not beat a naive baseline. The later window was only a few points above a coin toss, and it still lagged buy-and-hold after costs. Live Koins keeps the previous model until KOINS_MODEL_V2 is turned on. It is off.",
};

export const BOT_SCORECARD_SUMMARY =
  "This is a check of the daily-history model on delayed public prices, not a live broker tape. On the later window Stox called the 7-day direction right 50.1% of the time. Assuming every week finishes up was right 52.7% of the time. After a spread and commission model, that long/cash rule averaged about −0.02% a week against about +0.42% for buy-and-hold. The same check on major coins was right 50.8% of the time and still lagged buy-and-hold. A high stated confidence was not right that often, so the checked map now states about 50%. The 7-day base range contained the later price 49.6% of the time for shares and 50.4% for coins. A further check of relative strength, volatility sizing, index and currency context, and a small ensemble still did not beat buy-and-hold on that later window. Live share reports use the daily tape when it is available. Crypto projections stay paused, and the coin model change stays off. This is general information, not a personal recommendation.";
