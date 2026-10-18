/**
 * b32 REG-1 (P1, TT b31 signed-in): a cold isolate with the session store hanging had no cached
 * row, so the book sat in a skeleton and the dashboard showed "could not reach the sign-in
 * service" for about 2 minutes. The browser now carries its own last-good session: an httpOnly
 * cookie, HMAC-signed with the auth secret, binding user id + email to a hash of THIS session
 * token, valid 30 minutes (the same bound as the per-isolate stale cache). When the store does
 * not answer within the hard timeout and the isolate has no cache, a cookie that verifies and
 * matches the current token stands in. It can never name another browser's user: it needs the
 * server secret and the same session token.
 */
export const LAST_GOOD_SESSION_COOKIE = "af_ls";
export const LAST_GOOD_SESSION_MAX_AGE_S = 30 * 60;

const enc = new TextEncoder();

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(data: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(data));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

function b64url(s: string): string {
  return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64url(s: string): string {
  return decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))));
}

export interface LastGoodSession {
  uid: string;
  email: string;
  name: string;
  exp: number;
}

export async function signLastGoodSession(secret: string, token: string, user: { id: string; email: string; name?: string | null }, now = Date.now()): Promise<string> {
  const body: LastGoodSession & { th: string } = {
    uid: user.id,
    email: user.email,
    name: String(user.name || "").slice(0, 80),
    exp: now + LAST_GOOD_SESSION_MAX_AGE_S * 1000,
    th: (await sha256Hex(token)).slice(0, 32),
  };
  const payload = b64url(JSON.stringify(body));
  return `${payload}.${await hmacHex(secret, payload)}`;
}

export async function verifyLastGoodSession(secret: string, token: string, value: string | null | undefined, now = Date.now()): Promise<LastGoodSession | null> {
  if (!value || !token) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const want = await hmacHex(secret, payload);
  if (sig.length !== want.length) return null;
  let diff = 0;
  for (let i = 0; i < want.length; i += 1) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const body = JSON.parse(unb64url(payload)) as LastGoodSession & { th?: string };
    if (!body.uid || !(body.exp > now)) return null;
    if (body.th !== (await sha256Hex(token)).slice(0, 32)) return null;
    return { uid: body.uid, email: body.email, name: body.name, exp: body.exp };
  } catch {
    return null;
  }
}

export function cookieValueOf(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}
