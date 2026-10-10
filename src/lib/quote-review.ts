/**
 * Session-move checks for Stox and Koins reports (H2).
 *
 * A large-cap print above the cap, a split-like jump, a cents/dollars mix-up,
 * a stale quote, or two different figures for one ticker are withheld. The
 * report shows "data under review" instead of the number. One ticker keeps
 * one figure per window inside a single report.
 */

export const DATA_UNDER_REVIEW = "data under review";

/** Configurable. Large-cap 24-hour moves above this are withheld. */
export const LARGE_CAP_SESSION_MOVE_CAP_PCT = 20;

/** Other listed shares. Above this, treat the print as a split or a bad quote. */
export const EQUITY_SESSION_MOVE_CAP_PCT = 50;

/** Digital assets can move further. Above this, withhold the 24-hour print. */
export const CRYPTO_SESSION_MOVE_CAP_PCT = 80;

const STALE_MS = 36 * 60 * 60 * 1000;

/**
 * Names a 20% session move would be implausible for. The cap stays
 * LARGE_CAP_SESSION_MOVE_CAP_PCT so the list can grow without changing the rule.
 */
const LARGE_CAP_TICKERS = new Set(
  [
    "STO.AX", "BHP.AX", "CBA.AX", "CSL.AX", "NAB.AX", "WBC.AX", "WES.AX", "WOW.AX", "FMG.AX", "TLS.AX",
    "GMG.AX", "ANZ.AX", "RIO.AX", "WDS.AX", "MQG.AX", "TCL.AX", "ALL.AX", "COL.AX", "MQG.AX", "FPH.AX",
    "FPH.NZ", "MEL.NZ", "AIA.NZ", "MFT.NZ", "SPK.NZ", "CEN.NZ", "MCY.NZ", "EBO.NZ", "IFT.NZ", "ATM.NZ",
    "AAPL", "MSFT", "META", "GOOGL", "GOOG", "AMZN", "NVDA", "TSLA", "JPM", "CDW", "V", "MA", "UNH",
    "JNJ", "XOM", "AVGO", "LLY", "WMT", "HD", "COST", "BAC", "NFLX", "ORCL", "AMD", "INTC", "CSCO",
    "DIS", "KO", "PEP", "CVX", "MRK", "TMO", "MCD", "ABT", "QCOM", "IBM", "GE", "CAT", "GS", "MS",
    "NKE", "BA", "VRTX",
  ].map((ticker) => ticker.toUpperCase())
);

const SPLIT_RATIOS = [2, 3, 4, 5, 10, 20, 0.5, 1 / 3, 0.25, 0.2, 0.1, 0.05];
const CENT_RATIOS = [100, 0.01];
const FX_MIX_RATIOS = [1.54, 0.65];

export type MoveWindow = "1d" | "7d" | "30d";

export interface ReviewInput {
  ticker: string;
  assetClass: "stock" | "crypto";
  price: number;
  reportedChangePct: number;
  window: MoveWindow;
  previousClose?: number | null;
  secondSourceChangePct?: number | null;
  secondSourcePrice?: number | null;
  quotedAtMs?: number | null;
  nowMs?: number;
  market?: string | null;
  currency?: string | null;
}

export interface ReviewedMove {
  changePct: number;
  withheld: boolean;
  reason: string | null;
  display: string;
}

export function isLargeCapTicker(ticker: string): boolean {
  return LARGE_CAP_TICKERS.has(ticker.trim().toUpperCase());
}

function near(ratio: number, target: number, tolerance = 0.03): boolean {
  if (!(ratio > 0) || !(target > 0)) return false;
  return Math.abs(ratio - target) / target <= tolerance;
}

function windowCap(input: ReviewInput): number {
  const large = input.assetClass === "stock" && isLargeCapTicker(input.ticker);
  if (input.assetClass === "crypto") {
    if (input.window === "1d") return CRYPTO_SESSION_MOVE_CAP_PCT;
    if (input.window === "7d") return 120;
    return 200;
  }
  if (large) {
    if (input.window === "1d") return LARGE_CAP_SESSION_MOVE_CAP_PCT;
    if (input.window === "7d") return 35;
    return 60;
  }
  if (input.window === "1d") return EQUITY_SESSION_MOVE_CAP_PCT;
  if (input.window === "7d") return 80;
  return 150;
}

function formatMove(pct: number): string {
  const rounded = Math.round(pct * 100) / 100;
  return `${rounded >= 0 ? "+" : ""}${rounded}%`;
}

/** One print, checked against the previous close, a second source, and the cap. */
export function reviewSessionMove(input: ReviewInput): ReviewedMove {
  const reported = Number.isFinite(input.reportedChangePct) ? input.reportedChangePct : 0;
  const keep = (reason: string | null, withheld = false): ReviewedMove => ({
    changePct: withheld ? 0 : Math.round(reported * 100) / 100,
    withheld,
    reason,
    display: withheld ? DATA_UNDER_REVIEW : formatMove(reported),
  });

  if (input.market === "ASX" && input.currency === "USD") return keep("possible currency mix-up (AU versus US)", true);
  if (input.market === "US" && input.currency === "AUD") return keep("possible currency mix-up (AU versus US)", true);
  if (input.market === "NZX" && (input.currency === "USD" || input.currency === "AUD")) {
    return keep("possible currency mix-up", true);
  }

  const now = input.nowMs ?? Date.now();
  if (input.window === "1d" && typeof input.quotedAtMs === "number" && now - input.quotedAtMs > STALE_MS) {
    return keep("stale price", true);
  }

  const price = input.price;
  const previous = input.previousClose;
  if (typeof previous === "number" && previous > 0 && price > 0) {
    const ratio = price / previous;
    if (CENT_RATIOS.some((target) => near(ratio, target, 0.04))) return keep("cents versus dollars", true);
    if (SPLIT_RATIOS.some((target) => near(ratio, target, 0.025))) return keep("possible share split", true);
    const computed = ((price - previous) / previous) * 100;
    // A price that jumped by the AUD/USD rate while the quoted percent says something else.
    if (
      FX_MIX_RATIOS.some((target) => near(ratio, target, 0.02)) &&
      Math.abs(computed - reported) > 8 &&
      Math.abs(reported) > LARGE_CAP_SESSION_MOVE_CAP_PCT
    ) {
      return keep("possible currency mix-up (AU versus US)", true);
    }
    if (Math.abs(computed - reported) > 8 && Math.abs(reported) > windowCap(input)) {
      return keep("disagrees with the previous close", true);
    }
  }

  if (typeof input.secondSourcePrice === "number" && input.secondSourcePrice > 0 && price > 0) {
    const ratio = price / input.secondSourcePrice;
    if (CENT_RATIOS.some((target) => near(ratio, target, 0.04))) return keep("cents versus dollars", true);
  }

  if (typeof input.secondSourceChangePct === "number" && Number.isFinite(input.secondSourceChangePct)) {
    if (Math.abs(input.secondSourceChangePct - reported) > 8) return keep("second source disagrees", true);
  }

  if (Math.abs(reported) > windowCap(input)) {
    const large = input.assetClass === "stock" && isLargeCapTicker(input.ticker);
    return keep(large ? "above the large-cap session guard" : "above the session move guard", true);
  }

  return keep(null, false);
}

/**
 * One result per ticker and window. A second, different figure withholds both
 * so the report cannot show 33.16% and 13.90% as the same 24-hour move.
 */
export function createQuoteBook() {
  const seen = new Map<string, { reported: number; result: ReviewedMove }>();
  return {
    review(input: ReviewInput): ReviewedMove {
      const id = `${input.ticker.trim().toUpperCase()}|${input.window}`;
      const prior = seen.get(id);
      if (prior && Math.abs(prior.reported - input.reportedChangePct) > 0.05) {
        const withheld: ReviewedMove = {
          changePct: 0,
          withheld: true,
          reason: "quoted twice with different values",
          display: DATA_UNDER_REVIEW,
        };
        console.warn(
          `[quote-review] ${id} rejected: ${withheld.reason} (${prior.reported} vs ${input.reportedChangePct})`
        );
        seen.set(id, { reported: input.reportedChangePct, result: withheld });
        return withheld;
      }
      if (prior) return prior.result;
      const result = reviewSessionMove(input);
      if (result.withheld) {
        console.warn(`[quote-review] ${id} rejected: ${result.reason} (reported ${input.reportedChangePct})`);
      }
      seen.set(id, { reported: input.reportedChangePct, result });
      return result;
    },
  };
}

export type QuoteBook = ReturnType<typeof createQuoteBook>;
