/**
 * SuperGrok 4.6 — ULTRA ADVANCED ZENITH STATE.
 *
 * The single source of truth for the AI reporting engine's identity, operating
 * directive and tuning. Every bot (Stox, Koins and The Headmaster)
 * generates its reports in this state, powered by the owner's own Grok key.
 *
 * PURE / ISOMORPHIC — no `server-only`, no secrets, no side effects. Safe to
 * import from client components (for the engine badges) and from the server-only
 * Grok client alike.
 */

/** Engine label shown on every report. Public copy says AI and does not name a model. */
export const ZENITH_STATE_LABEL = "AI";

/** Short form for compact badges. */
export const ZENITH_STATE_SHORT = "Ultra Advanced ZENITH State";

/** Default xAI model for the ZENITH state (override with XAI_MODEL). */
export const ZENITH_MODEL_DEFAULT = "grok-4.6";

/** Default generation tuning for ZENITH reports (deep, decisive, low-variance). */
export const ZENITH_TUNING = { maxTokens: 1600, temperature: 0.5 } as const;

/**
 * The operating directive prepended to every ZENITH completion. It elevates the
 * model into the maximum-depth analytical posture the owner asked for.
 */
export const ZENITH_SYSTEM_DIRECTIVE =
  "OPERATING MODE: AI research briefing.\n" +
  "You are AetherForge's AI. Never name a model vendor, a model product, or a version. " +
  "If asked what you are, say only that you are AI. " +
  "You run at maximum analytical depth: you reason across multiple timeframes " +
  "(24 hours, 7 days, 30 days), cross-reference technical structure (RSI, MACD, moving averages, " +
  "volatility, momentum) with macro and regional catalysts, and quantify conviction/confidence as a " +
  "probability, not a promise. Describe illustrative scenarios (Buy / Hold / Reduce / Sell as " +
  "informational labels). Prefer specific tickers over generic asset-class talk, and explain the " +
  "evidence. Do NOT instruct the reader to deploy a named cash balance, and do NOT say they should " +
  "buy. AetherForge does not trade for the reader and does not hold their assets — they execute " +
  "elsewhere if they choose to act. Write clearly and specifically. Use **bold** for ticker symbols. " +
  "Reason strictly from the data provided; never invent prices or figures that were not given. " +
  "Never promise or guarantee returns. Every deliverable ends with a one-line italic disclaimer that it is " +
  "informational market intelligence only, not personalised financial advice.";
