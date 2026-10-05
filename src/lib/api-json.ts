/**
 * Client response guard. A Cloudflare or Next HTML/text body must never be
 * parsed as JSON, and the parse exception must never reach the page.
 */

import { LIVE_CRYPTO_UNAVAILABLE } from "@/lib/crypto-market";

export { LIVE_CRYPTO_UNAVAILABLE };

export function isCryptoApiUrl(url: string): boolean {
  return url.includes("/api/crypto");
}

export function plainApiFailure(url: string): string {
  return isCryptoApiUrl(url) ? LIVE_CRYPTO_UNAVAILABLE : "The server returned an unexpected response.";
}

/** Replace a parse exception, an HTML document, or a Cloudflare text body with a plain sentence. */
export function clientFacingError(url: string, error: unknown): string {
  const fallback = plainApiFailure(url);
  if (typeof error !== "string") return fallback;
  const text = error.trim();
  if (!text) return fallback;
  if (/unexpected token|<!doctype|not valid json|error code:\s*50\d|syntaxerror/i.test(text)) return fallback;
  if (text.includes("<") || text.includes(">")) return fallback;
  return text.length > 240 ? fallback : text;
}

export function parseApiBody(
  url: string,
  contentType: string | null,
  body: string,
  status: number
): { ok: true; json: Record<string, unknown> } | { ok: false; error: string; status: number } {
  const fallback = plainApiFailure(url);
  const trimmed = body.trim();
  const type = (contentType || "").toLowerCase();
  const headerSaysJson = type.includes("json");
  const looksJson = trimmed.startsWith("{") || trimmed.startsWith("[");
  if (!trimmed || (!headerSaysJson && !looksJson)) {
    return { ok: false, error: fallback, status };
  }
  try {
    const json = JSON.parse(trimmed) as unknown;
    if (!json || typeof json !== "object" || Array.isArray(json)) {
      return { ok: false, error: fallback, status };
    }
    return { ok: true, json: json as Record<string, unknown> };
  } catch {
    return { ok: false, error: fallback, status };
  }
}
