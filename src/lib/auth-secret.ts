/**
 * AUTH-FAIL-CLOSED: production must not sign or verify sessions with a missing
 * secret or with Better Auth's published library fallback.
 * The comparison value is never written to logs or error text.
 */

export class AuthSecretUnavailable extends Error {
  constructor() {
    super("Sign-in is unavailable.");
    this.name = "AuthSecretUnavailable";
  }
}

/** Published Better Auth fallback. Compared, never logged. */
const LIBRARY_DEFAULT_AUTH_SECRET = "better-auth-secret-123456789";

export function isUsableAuthSecret(secret: string | null | undefined): boolean {
  if (typeof secret !== "string") return false;
  const trimmed = secret.trim();
  if (!trimmed) return false;
  if (trimmed === LIBRARY_DEFAULT_AUTH_SECRET) return false;
  return true;
}

/** The configured secret, unchanged, or undefined when it must not be used. */
export function configuredAuthSecret(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const raw = env.BETTER_AUTH_SECRET;
  if (!isUsableAuthSecret(raw)) return undefined;
  return raw;
}

export function productionAuthClosed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "production" && configuredAuthSecret(env) === undefined;
}

/** Generic production response. No secret, no Set-Cookie, and not cacheable. */
export function closedAuthResponse(): Response {
  return new Response(JSON.stringify({ message: "Sign-in is unavailable." }), {
    status: 503,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
