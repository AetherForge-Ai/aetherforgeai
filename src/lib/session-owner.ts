/**
 * Which paper book a screen is allowed to paint.
 * Live session id is the browser's account. The page id is whoever the
 * server render was built for. They must match before identity or figures show.
 */

export type SessionReadMode = "refresh" | "read" | "strict" | "strict-db";

export type AccountPaint = "pending" | "paint" | "mismatch" | "signed-out";

export interface LiveSessionUser {
  id: string;
  email: string;
  name: string;
  image?: string | null;
  subscription_status?: string | null;
  subscription_plan?: string | null;
}

/** Non-rotating identity probe. Must stay a different request from the refresh flight. */
export const LIVE_SESSION_PATH =
  "/api/auth/get-session?disableCookieCache=true&disableRefresh=true";

/** Existing single-flight refresh. Do not add cache-bypass flags here. */
export const REFRESH_SESSION_PATH = "/api/auth/get-session";

const SESSION_TOKEN = /(?:^|;\s*)(?:__Secure-)?better-auth\.session_token=([^;]+)/;
const SESSION_DATA = /^(?:__Secure-)?better-auth\.session_data=/;

export function sessionFlightKey(
  cookieHeader: string | null | undefined,
  mode: SessionReadMode,
): string {
  const match = (cookieHeader || "").match(SESSION_TOKEN);
  return `${mode}:${match?.[1] || "none"}`;
}

export function hasSessionDataCookie(cookieHeader: string | null | undefined): boolean {
  if (!cookieHeader) return false;
  return cookieHeader.split(";").some((part) => SESSION_DATA.test(part.trim()));
}

/** Drop session_data only. The session token stays so a DB read can still resolve. */
export function stripSessionDataCookie(cookieHeader: string | null | undefined): string {
  if (!cookieHeader) return "";
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part && !SESSION_DATA.test(part))
    .join("; ");
}

/**
 * `liveUserId === undefined` means the probe has not finished.
 * Null/empty means signed out. Any other id must equal the page owner.
 */
export function accountPaintDecision(
  pageUserId: string | null | undefined,
  liveUserId: string | null | undefined,
): AccountPaint {
  if (liveUserId === undefined) return "pending";
  if (!liveUserId) return "signed-out";
  if (!pageUserId || pageUserId !== liveUserId) return "mismatch";
  return "paint";
}

/** Nav identity renders only for the confirmed live owner, never a stale atom id. */
export function mayPaintNavIdentity(
  liveUserId: string | null | undefined,
  candidateUserId: string | null | undefined,
): boolean {
  if (!liveUserId || !candidateUserId) return false;
  return liveUserId === candidateUserId;
}

/**
 * A null strict read may use the one rotating refresh.
 * Dashboard pages always try once (a bad session_data cookie looks signed-out).
 * The nav refreshes only when the session atom already thinks someone is signed in,
 * so anonymous marketing pages do not rotate a cookie.
 */
export function shouldRecoverSession(input: {
  purpose: "page" | "nav";
  atomUserId?: string | null;
}): boolean {
  if (input.purpose === "page") return true;
  return !!input.atomUserId;
}
