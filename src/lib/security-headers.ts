/**
 * Response headers for the public site (CR-5, BL-4).
 *
 * The Content-Security-Policy is enforced. It has script-src, object-src 'none',
 * base-uri 'self' and frame-ancestors.
 *
 * script-src keeps 'unsafe-inline'. Next.js writes inline bootstrap scripts and
 * the consent-gated gtag init without a nonce. A nonce policy needs every page
 * rendered per request (no static or edge-cached pages, see M-1), so it is a
 * separate change. Script origins are still limited to this site, Google Tag
 * Manager / Analytics, and Cloudflare's own beacon. The stricter nonce-free
 * policy stays as Report-Only so violations keep being reported.
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
  "'unsafe-inline'",
  "https://www.googletagmanager.com",
  "https://*.google-analytics.com",
  "https://static.cloudflareinsights.com",
] as const;

export function frameAncestors(allowTotalumTest = CSP_ALLOW_TOTALUM_TEST): string {
  const origins = ["'self'", "https://web.totalum.app"];
  if (allowTotalumTest) origins.push(TOTALUM_TEST_ORIGIN);
  return `frame-ancestors ${origins.join(" ")}`;
}

export function enforcedCsp(allowTotalumTest = CSP_ALLOW_TOTALUM_TEST): string {
  return [
    `script-src ${SCRIPT_SOURCES.join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    frameAncestors(allowTotalumTest),
  ].join("; ");
}

export const SECURITY_HEADERS = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Content-Security-Policy": enforcedCsp(),
  "Content-Security-Policy-Report-Only":
    "script-src 'self' https://www.googletagmanager.com; object-src 'none'; base-uri 'self'",
  "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), usb=()",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
} as const;

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
