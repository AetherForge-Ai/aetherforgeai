/**
 * b42 P1 (TT b41: /settings still SIGNED IN at 1 ms and 101 ms after Sign out). The Sign out click sets
 * this cookie synchronously, before any network request, so every request the browser makes after the
 * click carries it, even one that overtakes the logout POST. The middleware treats a request with
 * the marker as signed out (307 to /login with no-store, account APIs 401/null, auth cookies expired),
 * and the server revokes the session it names. Only a successful sign-in clears it.
 * Its value is just the click time; it carries no identity.
 */
export const SIGN_OUT_COOKIE = "af_so";
export const SIGN_OUT_MARKER_MAX_AGE_S = 24 * 60 * 60;

/** True when the Cookie header (or a cookie getter) carries the sign-out marker. */
export function hasSignOutMarker(source: string | null | undefined | ((name: string) => string | undefined)): boolean {
  if (typeof source === "function") return Boolean(source(SIGN_OUT_COOKIE));
  if (!source) return false;
  return source.split(";").some((part) => {
    const [name, ...rest] = part.trim().split("=");
    return name === SIGN_OUT_COOKIE && rest.join("=").length > 0;
  });
}

/** Set-Cookie value that removes the marker (sent with a successful sign-in). */
export function clearSignOutMarkerHeader(): string {
  return `${SIGN_OUT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax; Secure`;
}

/** Browser only: set the marker now, synchronously, before the logout request starts. */
export function markSigningOut(now = Date.now()): void {
  if (typeof document === "undefined") return;
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${SIGN_OUT_COOKIE}=${now}; Path=/; Max-Age=${SIGN_OUT_MARKER_MAX_AGE_S}; SameSite=Lax${secure}`;
}
