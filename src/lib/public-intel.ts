/**
 * Public market and projection payloads.
 * Ratings, conviction and position-sizing language stay off these responses.
 * The internal engine can still score a name; this layer is what the site sends.
 */

const DROPPED_KEYS = new Set(["signal", "conviction", "convictionReason"]);

/** Mirrors the brief's public-payload check, plus conviction. */
export const PUBLIC_ADVICE_LEAK =
  /"signal"|strong buy|"buy"|"sell"|reduce|size positions|conviction/i;

export function technicalSnapshot(input: {
  rsi?: number | null;
  vsSma20?: number | null;
  regime?: string | null;
  dailyVolPct?: number | null;
}): string {
  const rsi = typeof input.rsi === "number" && Number.isFinite(input.rsi) ? Math.round(input.rsi) : null;
  const zone = rsi == null ? null : rsi >= 70 ? "overbought" : rsi <= 30 ? "oversold" : "mid-range";
  const vs = typeof input.vsSma20 === "number" && Number.isFinite(input.vsSma20) ? input.vsSma20 : null;
  const average =
    vs == null
      ? null
      : vs >= 0.5
        ? "above its 20-day average"
        : vs <= -0.5
          ? "below its 20-day average"
          : "near its 20-day average";
  const hot =
    input.regime === "High Volatility" || (typeof input.dailyVolPct === "number" && input.dailyVolPct > 2.6);
  const quiet = typeof input.dailyVolPct === "number" && input.dailyVolPct < 1 && !hot;
  const vol = hot ? "high" : quiet ? "low" : "moderate";
  const lead = rsi != null && zone ? `RSI ${rsi} (${zone})` : "the tape is mixed";
  const place = average ? `, ${average}` : "";
  return `Technical snapshot: ${lead}${place}. Volatility: ${vol}.`;
}

export function modelRangeLine(outlook?: {
  expectedPct?: number;
  base?: { lowPct?: number; highPct?: number };
} | null): string | null {
  const low = outlook?.base?.lowPct;
  const high = outlook?.base?.highPct;
  const mid = outlook?.expectedPct;
  if (typeof low !== "number" || typeof high !== "number" || typeof mid !== "number") return null;
  const fmt = (n: number, dp = 0) => {
    const abs = Math.abs(n).toFixed(dp);
    if (n > 0) return `+${abs}%`;
    if (n < 0) return `−${abs}%`;
    return "0%";
  };
  return `Model range for the next 7 days: ${fmt(low)} to ${fmt(high)} (central ${fmt(mid, 2)}). This is a calculation from past prices, not a forecast you should act on.`;
}

/**
 * Recommendation phrasing only. A third-party story that matches is dropped
 * whole. Headlines and URLs are never edited. Macro words such as "hold" and
 * "reduces" are not a reason to drop a story.
 */
export const PUBLISHER_SIGNAL_WORD =
  /\bstocks?\s+to\s+(?:buy|sell)\b|\b(?:buy|sell)\s+rating\b|\bstrong\s+buy\b|\b(?:upgrade|upgraded|upgrades)\s+to\s+buy\b|\b(?:downgrade|downgraded|downgrades)\s+to\s+sell\b|\breasons?\s+to\s+(?:buy|sell)\b|\b(?:buy|sell)\s+now\b|\bbetter buy\b|\bwhich(?:\s+[a-z0-9.]+){0,6}\s+is the better (?:buy|value)\b|\bvs\.?\s+\S[^:]{0,80}:\s*which\b[^.?\n]{0,80}\b(?:better|value|buy)\b/i;

export function publisherTextHasSignalWord(text: string): boolean {
  return PUBLISHER_SIGNAL_WORD.test(text);
}

/** Drop recommendation words from AetherForge copy. Never use this on a publisher headline or URL. */
export function scrubPublicCopy(text: string): string {
  return text
    .replace(/size positions/gi, "the outcome range")
    .replace(/strong buy/gi, "firm momentum")
    .replace(/\b(buy|sell|hold)\b/gi, "")
    .replace(/reduce/gi, "ease")
    .replace(/conviction/gi, "confidence")
    .replace(/\bsignals?\b/gi, "readings")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

const DROPPED_STORY = Symbol("dropped-publisher-story");

function isPublisherStory(row: Record<string, unknown>): boolean {
  return typeof row.headline === "string" && (typeof row.url === "string" || typeof row.summary === "string");
}

function publisherStoryOrDrop(row: Record<string, unknown>): Record<string, unknown> | typeof DROPPED_STORY {
  const publisherBits = Object.values(row)
    .filter((value): value is string => typeof value === "string")
    .join("\n");
  if (publisherTextHasSignalWord(publisherBits)) return DROPPED_STORY;
  return { ...row };
}

function scrubValue(value: unknown): unknown {
  if (typeof value === "string") return scrubPublicCopy(value);
  if (Array.isArray(value)) {
    return value.map(scrubValue).filter((item) => item !== DROPPED_STORY);
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (isPublisherStory(record)) return publisherStoryOrDrop(record);
    return toPublicMarketRecord(record);
  }
  return value;
}

export function toPublicMarketRecord(row: Record<string, unknown>): Record<string, unknown> {
  const snapshot = technicalSnapshot({
    rsi: typeof row.rsi === "number" ? row.rsi : null,
    vsSma20: typeof row.vsSma20 === "number" ? row.vsSma20 : null,
    regime: typeof row.regime === "string" ? row.regime : null,
    dailyVolPct: typeof row.dailyVolPct === "number" ? row.dailyVolPct : null,
  });
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (DROPPED_KEYS.has(key)) continue;
    if (key === "reasoning") {
      next.reasoning = snapshot;
      continue;
    }
    next[key] = scrubValue(value);
  }
  if ("rsi" in row || "vsSma20" in row || "regime" in row) {
    next.reasoning = snapshot;
  }
  return next;
}

export function toPublicPayload<T>(value: T): T {
  return scrubValue(value) as T;
}
