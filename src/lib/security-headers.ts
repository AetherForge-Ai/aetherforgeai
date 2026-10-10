/**
 * Response headers for the public site.
 *
 * frame-ancestors allows this site and the Totalum editor preview.
 * TODO(owner): totalum-frontend-test.web.app stays because Totalum's preview may need it. Do not remove it until that preview is confirmed unused.
 * localhost is omitted so a production response never trusts a local parent.
 * ScriptExecutor only runs outside production.
 *
 * Cloudflare "Always Use HTTPS" is a dashboard toggle and is not in this repo.
 * HSTS is one year with includeSubDomains. preload is omitted until Lukas agrees.
 * X-Frame-Options is omitted on purpose. SAMEORIGIN or DENY would block the
 * Totalum preview at https://web.totalum.app, which frame-ancestors allows.
 * script-src stays report-only. Enforcing it is not safe here: Next.js inline
 * scripts and the consent-gated gtag have no nonce, so an enforcing script-src
 * would break the page and the analytics tag.
 * pull-check:qa-2026-10-10-medium-m10-m15-low-l6-l17
 */
export const SECURITY_HEADERS = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Content-Security-Policy":
    "frame-ancestors 'self' https://web.totalum.app https://totalum-frontend-test.web.app",
  "Content-Security-Policy-Report-Only":
    "script-src 'self' https://www.googletagmanager.com; object-src 'none'; base-uri 'self'",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), usb=()",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
} as const;
