/**
 * Read the signed session token from a Cookie header.
 * Does not touch session_data and does not build a Set-Cookie.
 * better-auth's get-session deletes the token when the DB row looks missing
 * or the session touch fails; price refresh must not call that endpoint.
 */

/** First matching cookie. Values may contain `=` (the signature padding). */
export function cookieValue(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader || !name) return null;
  const str = cookieHeader;
  let index = 0;
  while (index < str.length) {
    const eqIdx = str.indexOf("=", index);
    if (eqIdx === -1) break;
    let endIdx = str.indexOf(";", index);
    if (endIdx === -1) endIdx = str.length;
    else if (endIdx < eqIdx) {
      index = endIdx + 1;
      continue;
    }
    const key = str.slice(index, eqIdx).trim();
    if (key === name) {
      const raw = str.slice(eqIdx + 1, endIdx).trim().replace(/^"|"$/g, "");
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
    index = endIdx + 1;
  }
  return null;
}

/** True when the session row is still inside its expiry. A miss is not a cookie clear. */
export function sessionExpiresInFuture(expiresAt: unknown, now = Date.now()): boolean {
  if (expiresAt == null) return false;
  const ms = expiresAt instanceof Date ? expiresAt.getTime() : new Date(String(expiresAt)).getTime();
  return Number.isFinite(ms) && ms > now;
}

/**
 * better-auth signed cookie: `token.base64signature`.
 * Returns the raw session token, or null when the signature does not match.
 */
export async function verifySignedSessionToken(
  cookieValueRaw: string | null | undefined,
  secret: string,
): Promise<string | null> {
  if (!cookieValueRaw || !secret) return null;
  const signatureStartPos = cookieValueRaw.lastIndexOf(".");
  if (signatureStartPos < 1) return null;
  const token = cookieValueRaw.substring(0, signatureStartPos);
  const signature = cookieValueRaw.substring(signatureStartPos + 1);
  if (!token || signature.length !== 44 || !signature.endsWith("=")) return null;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const bytes = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
    const ok = await crypto.subtle.verify(
      { name: "HMAC" },
      key,
      bytes,
      new TextEncoder().encode(token),
    );
    return ok ? token : null;
  } catch {
    return null;
  }
}

/** Sign a token the same way better-auth stores `session_token`. Test helper and local checks. */
export async function signSessionToken(token: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token));
  const signature = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `${token}.${signature}`;
}

/** b27 H-4: true when this Set-Cookie line clears the named cookie (empty value, Max-Age=0 or a past Expires). */
export function setCookieClears(line: string, name: string): boolean {
  const [pair, ...attrs] = line.split(";");
  const eq = pair.indexOf("=");
  if (eq < 0 || pair.slice(0, eq).trim() !== name) return false;
  const value = pair.slice(eq + 1).trim();
  const lower = attrs.map((a) => a.trim().toLowerCase());
  if (lower.some((a) => a === "max-age=0" || /^max-age=-/.test(a))) return true;
  const exp = lower.find((a) => a.startsWith("expires="));
  if (exp && new Date(exp.slice(8)).getTime() <= Date.now()) return true;
  return value === "" || value === '""';
}

/** b27 H-4: drop the Set-Cookie lines that would clear any of `names`. */
export function withoutClears(lines: readonly string[], names: readonly string[]): string[] {
  return lines.filter((line) => !names.some((n) => setCookieClears(line, n)));
}
