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

/**
 * Identity probe. Our route reads the session token and ignores session_data.
 * better-auth's get-session returns null on a bad HMAC before it looks at the
 * token, and a valid cache can name a different paper book than the token.
 */
export const LIVE_SESSION_PATH = "/api/session";

/**
 * Kept for the single-flight helper. Dashboard, nav, and Confirm must not call it:
 * a failed refresh deletes the session token, and the next POST /api/transactions is 401.
 */
export const REFRESH_SESSION_PATH = "/api/auth/get-session";

export const SESSION_DATA_COOKIE_NAMES = [
  "better-auth.session_data",
  "__Secure-better-auth.session_data",
] as const;

export const SESSION_TOKEN_COOKIE_NAMES = [
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
] as const;

export const SESSION_AUX_COOKIE_NAMES = [
  "better-auth.dont_remember",
  "__Secure-better-auth.dont_remember",
] as const;

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
 * Cookie header for a stable identity read. session_data is omitted so
 * better-auth cannot return the cached account or null out a valid token.
 */
export function cookieHeaderForStableRead(cookieHeader: string | null | undefined): string {
  return stripSessionDataCookie(cookieHeader);
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
 * A null identity probe must not call the rotating get-session.
 * That request deletes the session token when the cache HMAC is bad or the
 * session touch fails, which is the Confirm 401 and the login gate that follows.
 */
export function shouldRecoverSession(_input?: {
  purpose: "page" | "nav";
  atomUserId?: string | null;
}): boolean {
  return false;
}
