/**
 * DIAG-FLAGS-1: flag booleans for GET /api/health.
 *
 * The middleware bundle and the Node route handler do not share one process.env.
 * Next inlines a direct `process.env.NAME` read into the middleware bundle at build
 * time (the edge snapshot). A computed `env[name]` read is left for request time
 * (the runtime value OpenNext copies from the Worker env). Neither reading is
 * allowed to leave this module as a string: callers only see booleans.
 */

export const DIAG_FLAG_NAMES = [
  "GOAL_TEST_HOOKS",
  "PORTFOLIO_SHARING",
  "HEADMASTER_GOALS",
  "NEW_PRICE_STRUCTURE",
  "AI_SHOW_WORKING",
] as const;

export type DiagFlagName = (typeof DIAG_FLAG_NAMES)[number];

export type FlagPair = { runtime: boolean; edge: boolean };

/** Response and request header. 0/1 pairs, middleware sets it on /api/health only. */
export const EDGE_FLAGS_HEADER = "x-af-edge-flags";

export function flagEnabled(name: DiagFlagName, raw: string | undefined): boolean {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (name === "PORTFOLIO_SHARING") return value.toLowerCase() === "on";
  // No call site reads this flag yet. Accept the two switches used by the others.
  if (name === "NEW_PRICE_STRUCTURE") return value === "1" || value.toLowerCase() === "on";
  return value === "1";
}

/**
 * Build-time edge snapshot. Each flag is a direct property read so the middleware
 * compiler can inline it. Do not route this through `env[name]`.
 */
export function edgeFlagState(): Record<DiagFlagName, boolean> {
  return {
    GOAL_TEST_HOOKS: process.env.GOAL_TEST_HOOKS === "1",
    PORTFOLIO_SHARING: (process.env.PORTFOLIO_SHARING || "").trim().toLowerCase() === "on",
    HEADMASTER_GOALS: process.env.HEADMASTER_GOALS === "1",
    NEW_PRICE_STRUCTURE:
      process.env.NEW_PRICE_STRUCTURE === "1" ||
      (process.env.NEW_PRICE_STRUCTURE || "").trim().toLowerCase() === "on",
    AI_SHOW_WORKING: process.env.AI_SHOW_WORKING === "1",
  };
}

/** Request-time read. The key is computed so the middleware compiler does not inline it. */
export function runtimeFlagState(
  env: Record<string, string | undefined> = process.env,
): Record<DiagFlagName, boolean> {
  const flags = {} as Record<DiagFlagName, boolean>;
  for (const name of DIAG_FLAG_NAMES) flags[name] = flagEnabled(name, env[name]);
  return flags;
}

export function encodeEdgeFlags(flags: Record<DiagFlagName, boolean>): string {
  return DIAG_FLAG_NAMES.map((name) => `${name}=${flags[name] ? "1" : "0"}`).join(",");
}

/** Unknown names and anything other than 0 or 1 stay off. The raw header is never copied through. */
export function decodeEdgeFlags(header: string | null | undefined): Record<DiagFlagName, boolean> {
  const flags = {} as Record<DiagFlagName, boolean>;
  for (const name of DIAG_FLAG_NAMES) flags[name] = false;
  if (!header) return flags;
  const known = new Set<string>(DIAG_FLAG_NAMES);
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const name = part.slice(0, eq);
    const bit = part.slice(eq + 1);
    if (!known.has(name) || (bit !== "0" && bit !== "1")) continue;
    flags[name as DiagFlagName] = bit === "1";
  }
  return flags;
}

export function healthFlags(
  edgeHeader: string | null | undefined,
  env: Record<string, string | undefined> = process.env,
): Record<DiagFlagName, FlagPair> {
  const runtime = runtimeFlagState(env);
  const edge = decodeEdgeFlags(edgeHeader);
  const flags = {} as Record<DiagFlagName, FlagPair>;
  for (const name of DIAG_FLAG_NAMES) flags[name] = { runtime: runtime[name], edge: edge[name] };
  return flags;
}
