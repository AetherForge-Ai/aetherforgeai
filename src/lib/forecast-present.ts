import { sha256Hex } from "@/lib/forecast-chain";
import { CRYPTO_PROJECTIONS_PAUSED, CRYPTO_PROJECTIONS_PAUSE_MESSAGE } from "@/lib/projection-pause";
import { MIN_RESOLVED_FOR_BAND } from "@/lib/forecast-scorecard";

/**
 * Applied only when a real traded-value, market-cap, or volume figure is supplied.
 * The owner can change the floors. Missing figures are not filled in.
 */
export const EQUITY_VALUE_TRADED_FLOOR = 250_000;
export const CRYPTO_MARKET_CAP_FLOOR_USD = 50_000_000;
export const CRYPTO_VOLUME_FLOOR_USD = 1_000_000;
export const PENNY_PRICE_FLOOR = 0.05;
export const MIN_OBSERVED_CLOSES = 40;
export const MODEL_VERSION = "rules-range-7d-v1";

export const EQUITY_SOURCE_LABEL =
  "Source: public market data (Yahoo Finance), delayed. Not a direct NZX or ASX feed.";
export const CRYPTO_SOURCE_LABEL = "Source: public crypto prices, delayed.";
export const DELAY_LABEL = "Delayed. The as-of time is the time the feed last answered.";

export type ForecastSurface = "projections" | "report";

export interface ForecastEvidence {
  bot: "stox" | "koins";
  ticker: string;
  market: "NZX" | "ASX" | "US" | "CRYPTO";
  assetClass: "stock" | "crypto";
  surface: ForecastSurface;
  venueDex: boolean;
  inNamedUniverse: boolean;
  price: number | null;
  marketCapUsd?: number | null;
  volumeUsd24h?: number | null;
  valueTraded?: number | null;
  observedHistory: boolean;
  baseLowPct: number | null;
  baseHighPct: number | null;
  /** Ridge fit score, 0–100. It is not a probability. */
  confidence: number | null;
  regime?: string | null;
  rsi?: number | null;
  macdSignal?: string | null;
  vsSma20?: number | null;
  priorDayUp?: boolean | null;
  resolvedInBand?: { hits: number; n: number } | null;
}

export interface ForecastView {
  ticker: string;
  stance: "directional" | "no-edge" | "withheld";
  direction: "up" | "down" | null;
  headline: string;
  why: string;
  drivers: string[];
  probabilityLabel: string;
  sourceLabel: string;
  delayLabel: string;
  tableLabel: string;
  pUp: number | null;
  fitBand: string | null;
  loggable: boolean;
  inputsSummary: string;
  featuresHash: string;
  naiveUp: boolean | null;
  priceAtIssue: number | null;
}

export function isObservedHistory(series?: number[] | null): boolean {
  if (!series?.length) return false;
  let n = 0;
  for (const price of series) {
    if (typeof price === "number" && Number.isFinite(price) && price > 0) n += 1;
  }
  return n >= MIN_OBSERVED_CLOSES;
}

export function fitBand(confidence: number | null): string | null {
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) return null;
  const score = Math.max(0, Math.min(100, confidence));
  if (score < 40) return "0-39";
  if (score < 55) return "40-54";
  if (score < 70) return "55-69";
  if (score < 85) return "70-84";
  return "85-100";
}

export function forecastDrivers(input: {
  rsi?: number | null;
  macdSignal?: string | null;
  vsSma20?: number | null;
  regime?: string | null;
}): string[] {
  const drivers: string[] = [];
  if (input.macdSignal === "Bullish" || input.macdSignal === "Bearish" || input.macdSignal === "Neutral") {
    drivers.push(`MACD is ${input.macdSignal.toLowerCase()}`);
  }
  if (typeof input.rsi === "number" && Number.isFinite(input.rsi)) {
    const rsi = Math.round(input.rsi);
    const zone = rsi >= 70 ? "overbought" : rsi <= 30 ? "oversold" : "mid-range";
    drivers.push(`RSI ${rsi} is ${zone}`);
  }
  if (typeof input.vsSma20 === "number" && Number.isFinite(input.vsSma20)) {
    const place = input.vsSma20 >= 0.5 ? "above" : input.vsSma20 <= -0.5 ? "below" : "near";
    drivers.push(`price is ${place} its 20-day average`);
  }
  if (input.regime && drivers.length < 3) drivers.push(`regime is ${input.regime}`);
  return drivers.slice(0, 3);
}

function whyLine(drivers: string[]): string {
  if (!drivers.length) return "Why: the main drivers are not on this row.";
  return `Why: ${drivers.join("; ")}.`;
}

function probabilityLabel(resolved?: { hits: number; n: number } | null): { label: string; pUp: number | null } {
  if (!resolved || resolved.n < MIN_RESOLVED_FOR_BAND || resolved.hits < 0 || resolved.hits > resolved.n) {
    return {
      label: "A probability is not shown. This band has no realised frequency on the track record yet.",
      pUp: null,
    };
  }
  const pUp = resolved.hits / resolved.n;
  const pct = Math.round(pUp * 1000) / 10;
  return {
    label: `Realised frequency in this band: ${resolved.hits} of ${resolved.n} resolved forecasts were up (${pct}%). That is a count from the log.`,
    pUp,
  };
}

function contractTicker(ticker: string): boolean {
  return /^0x[a-f0-9]{8,}/i.test(ticker.trim());
}

function safetyReason(input: ForecastEvidence): string | null {
  if (input.venueDex || contractTicker(input.ticker)) {
    return "DEX and contract-style tokens are not shown as signals.";
  }
  if (input.assetClass === "crypto" || input.market === "CRYPTO") {
    if (!input.inNamedUniverse) return "This token is outside the named coin list, so it is not a signal.";
    if (typeof input.marketCapUsd === "number" && input.marketCapUsd < CRYPTO_MARKET_CAP_FLOOR_USD) {
      return "Market cap is below the published floor, so this is not a signal.";
    }
    if (typeof input.volumeUsd24h === "number" && input.volumeUsd24h < CRYPTO_VOLUME_FLOOR_USD) {
      return "Traded volume is below the published floor, so this is not a signal.";
    }
    return null;
  }
  if (typeof input.price === "number" && input.price > 0 && input.price < PENNY_PRICE_FLOOR) {
    return "The price is below the published floor, so this is not a signal.";
  }
  if (typeof input.valueTraded === "number" && input.valueTraded < EQUITY_VALUE_TRADED_FLOOR) {
    return "Traded value is below the published floor, so this is not a signal.";
  }
  if (!input.inNamedUniverse && typeof input.valueTraded !== "number") {
    return "Liquidity is not in the data, so this is not a signal.";
  }
  return null;
}

function bandStraddles(low: number, high: number): boolean {
  const lo = Math.min(low, high);
  const hi = Math.max(low, high);
  return lo <= 0 && hi >= 0;
}

/**
 * One presentation for a Stox or Koins forecast.
 * Crypto rows on the projections surface stay withheld while projections are paused.
 */
export function forecastViewForEvidence(input: ForecastEvidence): ForecastView {
  const drivers = forecastDrivers(input);
  const why = whyLine(drivers);
  const sourceLabel = input.assetClass === "crypto" || input.market === "CRYPTO" ? CRYPTO_SOURCE_LABEL : EQUITY_SOURCE_LABEL;
  const band = fitBand(input.confidence);
  const probability = probabilityLabel(input.resolvedInBand);
  const price = typeof input.price === "number" && input.price > 0 ? input.price : null;
  const base = {
    ticker: input.ticker.toUpperCase(),
    why,
    drivers,
    probabilityLabel: probability.label,
    sourceLabel,
    delayLabel: DELAY_LABEL,
    pUp: probability.pUp,
    fitBand: band,
    naiveUp: typeof input.priorDayUp === "boolean" ? input.priorDayUp : null,
    priceAtIssue: price,
    inputsSummary: "",
    featuresHash: "",
  };

  const finish = (view: Omit<ForecastView, "inputsSummary" | "featuresHash">): ForecastView => {
    const inputsSummary = [
      input.surface,
      view.stance,
      view.direction || "none",
      band || "no-fit",
      input.observedHistory ? "observed-closes" : "no-observed-closes",
      drivers.join(", ") || "no-drivers",
    ].join("; ");
    return {
      ...view,
      inputsSummary: inputsSummary.slice(0, 240),
      featuresHash: sha256Hex(`${MODEL_VERSION}|${inputsSummary}`),
    };
  };

  const cryptoPaused =
    CRYPTO_PROJECTIONS_PAUSED &&
    input.surface === "projections" &&
    (input.assetClass === "crypto" || input.market === "CRYPTO" || input.bot === "koins");
  if (cryptoPaused) {
    return finish({
      ...base,
      stance: "withheld",
      direction: null,
      headline: CRYPTO_PROJECTIONS_PAUSE_MESSAGE,
      tableLabel: "Not shown",
      loggable: false,
      pUp: null,
    });
  }

  const blocked = safetyReason(input);
  if (blocked) {
    return finish({
      ...base,
      stance: "withheld",
      direction: null,
      headline: blocked,
      tableLabel: "Not shown",
      loggable: false,
      pUp: null,
    });
  }

  if (!input.observedHistory || price == null) {
    return finish({
      ...base,
      stance: "withheld",
      direction: null,
      headline: "No directional call. An observed close series is not on this row.",
      tableLabel: "Not shown",
      loggable: false,
      pUp: null,
    });
  }

  const low = input.baseLowPct;
  const high = input.baseHighPct;
  const hasBand = typeof low === "number" && typeof high === "number" && Number.isFinite(low) && Number.isFinite(high);
  const weakFit = typeof input.confidence === "number" && input.confidence < 48;
  const hot = input.regime === "High Volatility";
  const straddles = !hasBand || bandStraddles(low as number, high as number);
  if (straddles || weakFit || hot) {
    const headline = straddles
      ? "No edge. The 7-day range includes both a rise and a fall, so there is no directional call."
      : hot
        ? "No edge. Volatility is high and the evidence is too weak for a directional call."
        : "No edge. The model fit is too weak for a directional call.";
    return finish({
      ...base,
      stance: "no-edge",
      direction: null,
      headline,
      tableLabel: "No edge",
      loggable: true,
      pUp: null,
    });
  }

  const direction = (low as number) > 0 && (high as number) > 0 ? "up" : "down";
  return finish({
    ...base,
    stance: "directional",
    direction,
    headline: direction === "up" ? "The 7-day range sits above zero." : "The 7-day range sits below zero.",
    tableLabel: probability.pUp == null ? "Range only" : `${Math.round(probability.pUp * 1000) / 10}% realised`,
    loggable: true,
  });
}

export function forecastId(bot: "stox" | "koins", ticker: string, day: string): string {
  return `${bot}:${ticker.toUpperCase()}:7d:${day}`;
}

export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
