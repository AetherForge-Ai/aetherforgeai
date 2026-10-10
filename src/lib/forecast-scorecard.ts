import { verifyChain, type ChainRecord, type ForecastBody, type OutcomeBody } from "@/lib/forecast-chain";

/** Directional forecasts needed before a hit rate or a Brier score is shown. */
export const MIN_RESOLVED_FOR_RATE = 30;

/** Resolved forecasts in one model-fit band before that band's frequency is shown. */
export const MIN_RESOLVED_FOR_BAND = 20;

/**
 * A sample this small cannot separate a slight edge from a coin flip.
 * The page still prints the measured rate and its interval, with this note.
 */
export const MIN_RESOLVED_FOR_EDGE = 1000;

const Z_95 = 1.96;

export interface WilsonInterval {
  low: number;
  high: number;
}

export interface CalibrationBand {
  band: string;
  n: number;
  realised: number;
}

export interface ForecastScorecard {
  status: "empty" | "unverified" | "not-enough" | "scored";
  chainOk: boolean;
  chainError: string | null;
  logged: number | null;
  resolved: number | null;
  open: number | null;
  abstained: number | null;
  directionalResolved: number | null;
  hits: number | null;
  hitRate: number | null;
  wilson: WilsonInterval | null;
  brier: number | null;
  brierCount: number | null;
  brierNaive: number | null;
  naiveCount: number | null;
  naiveHitRate: number | null;
  brierBuyHold: number | null;
  buyHoldHitRate: number | null;
  calibration: CalibrationBand[];
  message: string;
  edgeNote: string | null;
}

export function wilsonInterval(hits: number, n: number, z = Z_95): WilsonInterval | null {
  if (!Number.isInteger(n) || n <= 0 || !Number.isInteger(hits) || hits < 0 || hits > n) return null;
  const phat = hits / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (phat + z2 / (2 * n)) / denom;
  const margin = (z * Math.sqrt((phat * (1 - phat)) / n + z2 / (4 * n * n))) / denom;
  return {
    low: clamp01(centre - margin),
    high: clamp01(centre + margin),
  };
}

export function brierScore(rows: Array<{ p: number; y: 0 | 1 }>): number | null {
  if (!rows.length) return null;
  let sum = 0;
  for (const row of rows) {
    if (!(row.p >= 0) || !(row.p <= 1) || (row.y !== 0 && row.y !== 1)) return null;
    sum += (row.p - row.y) ** 2;
  }
  return sum / rows.length;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

interface ResolvedPair {
  forecast: ForecastBody & { prev_hash: string; hash: string };
  outcome: OutcomeBody & { prev_hash: string; hash: string };
}

function pairsFrom(records: ChainRecord[]): ResolvedPair[] {
  const forecasts = new Map<string, ResolvedPair["forecast"]>();
  const outcomes = new Map<string, ResolvedPair["outcome"]>();
  for (const row of records) {
    if (row.kind === "forecast") forecasts.set(row.id, row);
    if (row.kind === "outcome") outcomes.set(row.forecast_id, row);
  }
  const pairs: ResolvedPair[] = [];
  for (const [id, forecast] of forecasts) {
    const outcome = outcomes.get(id);
    if (outcome) pairs.push({ forecast, outcome });
  }
  return pairs;
}

function emptyCard(partial: Partial<ForecastScorecard> & Pick<ForecastScorecard, "status" | "message" | "chainOk">): ForecastScorecard {
  return {
    chainError: null,
    logged: null,
    resolved: null,
    open: null,
    abstained: null,
    directionalResolved: null,
    hits: null,
    hitRate: null,
    wilson: null,
    brier: null,
    brierCount: null,
    brierNaive: null,
    naiveCount: null,
    naiveHitRate: null,
    brierBuyHold: null,
    buyHoldHitRate: null,
    calibration: [],
    edgeNote: null,
    ...partial,
  };
}

/**
 * Scores only the records passed in. An empty log, a short sample, and a
 * broken chain all refuse a rate. Nothing here is filled in from a sample book.
 */
export function scorecardFromLog(input: { records: ChainRecord[]; error: string | null }): ForecastScorecard {
  if (input.error) {
    return emptyCard({
      status: "unverified",
      chainOk: false,
      chainError: input.error,
      message: "The log could not be read, so no figures are shown.",
    });
  }
  const verified = verifyChain(input.records);
  if (verified.ok === false) {
    return emptyCard({
      status: "unverified",
      chainOk: false,
      chainError: `Record ${verified.index + 1} failed the ${verified.reason} check.`,
      message: "The hash chain does not check out, so this page shows no figures.",
    });
  }
  const forecasts = input.records.filter((row): row is ResolvedPair["forecast"] => row.kind === "forecast");
  if (!forecasts.length) {
    return emptyCard({
      status: "empty",
      chainOk: true,
      logged: 0,
      resolved: 0,
      open: 0,
      abstained: 0,
      directionalResolved: 0,
      message: "Not enough data yet. No forecasts are on the log.",
    });
  }

  const pairs = pairsFrom(input.records);
  const resolvedIds = new Set(pairs.map((pair) => pair.forecast.id));
  const abstained = forecasts.filter((row) => row.stance === "no-edge").length;
  const directional = pairs.filter(
    (pair) => pair.forecast.stance === "directional" && (pair.forecast.direction === "up" || pair.forecast.direction === "down"),
  );
  const hits = directional.filter((pair) => (pair.forecast.direction === "up") === pair.outcome.actual_up).length;
  const counts = {
    logged: forecasts.length,
    resolved: pairs.length,
    open: forecasts.length - resolvedIds.size,
    abstained,
    directionalResolved: directional.length,
  };

  if (directional.length < MIN_RESOLVED_FOR_RATE) {
    return emptyCard({
      status: "not-enough",
      chainOk: true,
      ...counts,
      message: "Not enough data yet. A hit rate is not shown until enough directional forecasts have a later price.",
    });
  }

  const hitRate = hits / directional.length;
  const withP = directional.filter((pair) => typeof pair.forecast.p_up === "number");
  const brier =
    withP.length >= MIN_RESOLVED_FOR_RATE
      ? brierScore(withP.map((pair) => ({ p: pair.forecast.p_up as number, y: pair.outcome.actual_up ? 1 : 0 })))
      : null;
  const naive = directional.filter((pair) => typeof pair.forecast.naive_up === "boolean");
  const naiveReady = naive.length >= MIN_RESOLVED_FOR_RATE;
  const brierNaive = naiveReady
    ? brierScore(naive.map((pair) => ({ p: pair.forecast.naive_up ? 1 : 0, y: pair.outcome.actual_up ? 1 : 0 })))
    : null;
  const naiveHits = naive.filter((pair) => pair.forecast.naive_up === pair.outcome.actual_up).length;
  const buyHold = brierScore(directional.map((pair) => ({ p: 1, y: pair.outcome.actual_up ? 1 : 0 })));
  const buyHoldHits = directional.filter((pair) => pair.outcome.actual_up).length;

  const bands = new Map<string, { n: number; hits: number }>();
  for (const pair of directional) {
    const band = pair.forecast.fit_band;
    if (!band) continue;
    const slot = bands.get(band) || { n: 0, hits: 0 };
    slot.n += 1;
    if (pair.outcome.actual_up) slot.hits += 1;
    bands.set(band, slot);
  }
  const calibration: CalibrationBand[] = [...bands.entries()]
    .filter(([, slot]) => slot.n >= MIN_RESOLVED_FOR_BAND)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([band, slot]) => ({ band, n: slot.n, realised: slot.hits / slot.n }));

  return {
    status: "scored",
    chainOk: true,
    chainError: null,
    ...counts,
    hits,
    hitRate,
    wilson: wilsonInterval(hits, directional.length),
    brier,
    brierCount: withP.length,
    brierNaive,
    naiveCount: naive.length,
    naiveHitRate: naiveReady ? naiveHits / naive.length : null,
    brierBuyHold: buyHold,
    buyHoldHitRate: buyHoldHits / directional.length,
    calibration,
    message: "These figures are counts from the log.",
    edgeNote:
      directional.length < MIN_RESOLVED_FOR_EDGE
        ? "This sample is too small to read as an edge over a coin flip."
        : null,
  };
}

/** Realised up-frequency for one model-fit band, from resolved directional rows only. */
export function bandFrequency(
  records: ChainRecord[],
  band: string | null,
): { hits: number; n: number } | null {
  if (!band || !verifyChain(records).ok) return null;
  let hits = 0;
  let n = 0;
  const outcomes = new Map<string, boolean>();
  for (const row of records) {
    if (row.kind === "outcome") outcomes.set(row.forecast_id, row.actual_up);
  }
  for (const row of records) {
    if (row.kind !== "forecast" || row.stance !== "directional" || row.fit_band !== band) continue;
    const actual = outcomes.get(row.id);
    if (typeof actual !== "boolean") continue;
    n += 1;
    if (actual) hits += 1;
  }
  return { hits, n };
}
