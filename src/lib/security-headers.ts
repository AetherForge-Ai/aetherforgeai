/**
 * Response headers for the public site.
 *
 * frame-ancestors allows this site and the Totalum editor preview.
 * TODO(owner): totalum-frontend-test.web.app stays because Totalum's preview may need it. Do not remove it until that preview is confirmed unused.
 * localhost is omitted so a production response never trusts a local parent.
 * ScriptExecutor only runs outside production.
 *
 * Cloudflare "Always Use HTTPS" is a dashboard toggle and is not in this repo.
 * HSTS here is max-age=86400. Raise it to 15552000 after a clean week.
 */
export const SECURITY_HEADERS = {
  "Strict-Transport-Security": "max-age=86400",
  "Content-Security-Policy":
    "frame-ancestors 'self' https://web.totalum.app https://totalum-frontend-test.web.app",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
} as const;
