/**
 * Response headers for the public site (CR-5, BL-4).
 *
 * The Content-Security-Policy is enforced. It has script-src, object-src 'none',
 * base-uri 'self' and frame-ancestors.
 *
 * script-src uses a per-request nonce with 'strict-dynamic' (goal b8, CR-5).
 * 'unsafe-inline' is gone. Nonces were tried in b5 and parked because pages were
 * static; the root layout is force-dynamic, so every HTML document renders per
 * request and Next.js stamps the nonce (read from the request CSP header that
 * middleware sets) on its own bootstrap and RSC scripts. /docs/[slug] is now
 * force-dynamic too.
 * Trade-off: if an edge cache (K-02) stores a marketing page, the cached copy
 * replays its own header and nonce together, so scripts still run but that
 * nonce is shared until the entry expires.
 * Script origins stay limited to this site, Google Tag Manager / Analytics and
 * Cloudflare's beacon (host entries are ignored by CSP3 browsers under
 * 'strict-dynamic' and kept for older browsers).
 * The old Content-Security-Policy-Report-Only header was removed in b5: it had
 * no report-uri, so it reported nothing and only confused header checks.
 *
 * BL-4: totalum-frontend-test.web.app is off by default. Set
 * CSP_ALLOW_TOTALUM_TEST = true (or env CSP_ALLOW_TOTALUM_TEST=true at build)
 * to let that preview origin frame the site again.
 *
 * HSTS is one year with includeSubDomains. preload is omitted until Lukas agrees.
 * X-Frame-Options is omitted on purpose: frame-ancestors covers it and still
 * allows the Totalum editor preview at https://web.totalum.app.
 * pull-check:qa-2026-10-10-medium-m10-m15-low-l6-l17
 */

/** BL-4 flag. Default false: the Totalum test origin may not frame the site. */
export const CSP_ALLOW_TOTALUM_TEST = process.env.CSP_ALLOW_TOTALUM_TEST === "true";

export const TOTALUM_TEST_ORIGIN = "https://totalum-frontend-test.web.app";

export const SCRIPT_SOURCES = [
  "'self'",
  "https://www.googletagmanager.com",
  "https://*.google-analytics.com",
  "https://static.cloudflareinsights.com",
] as const;

export function frameAncestors(allowTotalumTest = CSP_ALLOW_TOTALUM_TEST): string {
  const origins = ["'self'", "https://web.totalum.app"];
  if (allowTotalumTest) origins.push(TOTALUM_TEST_ORIGIN);
  return `frame-ancestors ${origins.join(" ")}`;
}

/** A fresh base64 nonce (128 bits) for one response. */
export function makeCspNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function enforcedCsp(allowTotalumTest = CSP_ALLOW_TOTALUM_TEST, nonce?: string): string {
  const [self, ...hosts] = SCRIPT_SOURCES;
  const script = nonce ? [self, `'nonce-${nonce}'`, "'strict-dynamic'", ...hosts] : [self, ...hosts];
  return [
    `script-src ${script.join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    frameAncestors(allowTotalumTest),
  ].join("; ");
}

export const SECURITY_HEADERS = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Content-Security-Policy": enforcedCsp(),
  "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), usb=()",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
} as const;

/** Header set applied in next.config. The CSP is per request (nonce), so middleware sets it. */
export const STATIC_SECURITY_HEADERS = Object.fromEntries(
  Object.entries(SECURITY_HEADERS).filter(([key]) => key !== "Content-Security-Policy")
) as Record<string, string>;

/** The enforced, per-request policy middleware sends with every response it handles. */
export function nonceCsp(nonce: string): string {
  return enforcedCsp(CSP_ALLOW_TOTALUM_TEST, nonce);
}

/**
 * Public files other sites and mail clients may load (logos in emails, social
 * preview images, the manifest icons). They are served cross-origin.
 */
export const CROSS_ORIGIN_ASSET_SOURCES = [
  "/brand/:path*",
  "/icons/:path*",
  "/:file(.*\\.(?:png|jpg|jpeg|webp|svg|ico))",
  "/opengraph-image",
  "/twitter-image",
] as const;
