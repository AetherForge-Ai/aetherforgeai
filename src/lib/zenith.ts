/**
 * SuperGrok 4.3 — ULTRA ADVANCED ZENITH STATE.
 *
 * The single source of truth for the AI reporting engine's identity, operating
 * directive and tuning. Every bot (Stox, Koins and The Headmaster)
 * generates its reports in this state, powered by the owner's own Grok key.
 *
 * PURE / ISOMORPHIC — no `server-only`, no secrets, no side effects. Safe to
 * import from client components (for the engine badges) and from the server-only
 * Grok client alike.
 */

/** Full engine label shown on every report + report-trigger surface. */
export const ZENITH_STATE_LABEL = "SuperGrok 4.3 · Ultra Advanced ZENITH State";

/** Short form for compact badges. */
export const ZENITH_STATE_SHORT = "Ultra Advanced ZENITH State";

/** Default xAI model for the ZENITH state (override with XAI_MODEL). */
export const ZENITH_MODEL_DEFAULT = "grok-4.3";

/** Default generation tuning for ZENITH reports (deep, decisive, low-variance). */
export const ZENITH_TUNING = { maxTokens: 1600, temperature: 0.5 } as const;

/**
 * The operating directive prepended to every ZENITH completion. It elevates the
 * model into the maximum-depth analytical posture the owner asked for.
 */
export const ZENITH_SYSTEM_DIRECTIVE =
  "OPERATING MODE: SuperGrok 4.3 — ULTRA ADVANCED ZENITH STATE.\n" +
  "In ZENITH State you run at maximum analytical depth: you reason across multiple timeframes " +
  "(24 hours, 7 days, 30 days), cross-reference technical structure (RSI, MACD, moving averages, " +
  "volatility, momentum) with macro and regional catalysts, quantify conviction/confidence, and always " +
  "surface the single highest-impact action. Prefer specific tickers and markets over generic asset-class " +
  "advice — when cash is available to deploy, lead with concrete BUY/ACCUMULATE names and reasons. " +
  "Write with the precision and authority of an elite institutional trading desk — dense with insight, " +
  "free of filler, and decisive. Use **bold** for the highest-signal phrases and ticker symbols. " +
  "Reason strictly from the data provided; never invent prices or figures that were not given. " +
  "Never promise or guarantee returns. Every deliverable ends with a one-line italic disclaimer that it is " +
  "informational market intelligence only, not personalised financial advice.";
