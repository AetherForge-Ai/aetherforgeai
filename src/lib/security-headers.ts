/**
 * Response headers for the public site.
 *
 * frame-ancestors 'self' stops other origins framing the login page.
 * The Totalum editor preview iframes this app from
 * https://web.totalum.app, https://totalum-frontend-test.web.app and
 * http://localhost:8100 (see totalum-docs/project-recovery/02-nextjs-config.md).
 * Those parents are not 'self', so the preview frame will be blocked until
 * that embedding is reviewed. ScriptExecutor only runs outside production.
 *
 * Cloudflare "Always Use HTTPS" is a dashboard toggle and is not in this repo.
 * HSTS here is max-age=86400. Raise it to 15552000 after a clean week.
 */
export const SECURITY_HEADERS = {
  "Strict-Transport-Security": "max-age=86400",
  "Content-Security-Policy": "frame-ancestors 'self'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
} as const;
