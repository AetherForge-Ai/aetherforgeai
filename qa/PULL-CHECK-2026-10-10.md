# Pull check — 10 Oct 2026

This file is for a retest after Publish. This branch covers **H5–H11 only**. It does not Publish, it sends no email, and it contains no credentials.

Marker: `pull-check:qa-2026-10-10-high-h5-h11`

Branch: `cursor/qa-high-h5-h11-70ed`  
PR: https://github.com/AetherForge-Ai/aetherforgeai/pull/242  
Merged `origin/develop` at `e0ecbc9` before the PR.

Local checks on this branch: vitest 421 passed, `tsc --noEmit --skipLibCheck` passed, eslint reported 0 errors (12 existing warnings outside this batch), `next build` passed. Signed-out HTTP checks against `next start`: `/nope-404`, `/plans` and `/bots` are 404 with title `Page not found · AetherForge AI` and og:url `https://www.aetherforgeai.co.nz/404`. `/settings` and `/headmaster` redirect to login. `/billing` redirects to `/settings/billing`, which then redirects to login. `/robots.txt` has a Sitemap line and no Set-Cookie. `/sitemap.xml` has lastmod, `/projections`, no `/blog`, `/performance` yearly `2026-07-08`, and no Set-Cookie. The More menu lists Example results, Tax, Pricing, How it works, Projections and Trust.

## Needs Lukas

- DNS for `noreply@aetherforgeai.co.nz`, display name AetherForge AI, reply-to `admin@aetherforgeai.co.nz`:
  - TXT `aetherforgeai.co.nz` = `v=spf1 include:<mailbox-host> -all` (one SPF record; merge any existing one)
  - TXT `<selector>._domainkey.aetherforgeai.co.nz` = `v=DKIM1; k=rsa; p=<public key from the mailbox host>` (private key stays with the host)
  - TXT `_dmarc.aetherforgeai.co.nz` = `v=DMARC1; p=none; rua=mailto:admin@aetherforgeai.co.nz; adkim=s; aspf=s`
- Approval before any welcome, report or trade email is sent. Sending is hard off.
- Publish, when you choose to. This branch does not publish.
- HSTS preload is not this batch (M14).

## This batch

### H5 — fixed

Commits: `ffc6887`, `747609a`.  
Files: `src/lib/plan-usage.ts`, `src/lib/account-plan.ts`, `src/lib/notification-prefs.ts`, `src/app/settings/billing/page.tsx`, `src/app/settings/notifications/page.tsx`, `src/app/billing/page.tsx`, `src/app/api/account/notifications/route.ts`, `src/components/settings/*`, `src/app/pricing/page.tsx`, `src/components/pricing/PricingFAQ.tsx`, `next.config.ts`.

1. Sign in and open `/settings/billing`. Expect current plan, renewal, holdings, reports this month, Market Assistant this month.
2. Free: `n / 10`, `n / 3`, `n / 20`, renewal `No renewal date`. Starter 25 / 15 / 100. Pro 75 / unlimited / 500. Ultimate unlimited / unlimited / unlimited. Apex Dual (`dual_yearly`): name Apex Dual, holdings `n / 20 per bot`.
3. Open `/billing`. Expect `/settings/billing`.
4. Open `/pricing`. Expect an Apex Dual note: legacy yearly membership, not a published card, same Headmaster desk as Pro's Full Headmaster. Prices `NZ$0.00`, `NZ$16.00` / `NZ$160.00`, `NZ$49.00` / `NZ$490.00`, `NZ$199.00` / `NZ$1,990.00`. No GST.
5. Open `/settings/notifications`. Expect Report ready, Trade and ledger, Weekly summary, Product news, all off until opted in. Save text: `Notification choices saved on this browser. No email was sent.`

### H6 — fixed

Commit: `23079c7`.  
Files: `src/lib/activity-email.ts`, `src/lib/activity-email-server.ts`, `src/lib/report-email-copy.ts`, `src/app/api/account/activity-email/route.ts`, `src/lib/report-service.ts`, `src/lib/trial-report.ts`, `src/app/api/transactions/route.ts`, `src/app/register/page.tsx`, `src/components/dashboard/ReportCenter.tsx`.

1. Run a report on a book with positions. Toast: `Report saved below. No report email was sent.` Modal: `No report email was sent.`
2. Record a paper trade. Server log only. `sent` is false.
3. Sign up. Welcome is a preview to `/api/account/activity-email`. The route does not accept a destination address.
4. `activityEmailSendingEnabled()` is `return false` and does not read the environment.

### H7 — fixed

Commit: `6079437`.  
Files: `src/lib/route-gate.ts`, `src/middleware.ts`, `src/app/not-found.tsx`.

1. Signed out, open `/nope-404`, `/plans`, `/bots`. Expect 404, title `Page not found · AetherForge AI`, og:url ending `/404`.
2. Signed out, open `/settings` and `/headmaster`. Expect `/login?redirect=…`.
3. `/privacy` → `/privacy-policy`, `/how` → `/how-it-works`, `/live-results` → `/performance`.

### H8 — fixed

Commits: `e12dd86`, merge `b007e56`.  
Files: `src/lib/tape-display.ts`, `src/lib/crypto-names.ts`, `src/components/MarketTicker.tsx`, `src/components/dashboard/MarketsExplorer.tsx`, `src/lib/crypto-coingecko.ts`, `src/lib/crypto-yahoo.ts`.

1. On `/`, tape items show `US$` or `NZ$`. Show NZ$ is on the page. The rate line is 4 decimal places once today's rate has loaded.
2. On `/markets` Crypto, BAT is Basic Attention Token, STRK is Starknet, GALA is Gala, THETA is Theta Network, APE is ApeCoin, WLD is Worldcoin, ENJ is Enjin Coin. EOS and IOTA stay those names. Header is Name on crypto and Company on stocks. The DEX tab from U3 remains.

### H9 — fixed

Commit: `2a5da74`. Cookie strip in middleware is in `6079437`.  
Files: `src/app/sitemap.ts`, `src/app/robots.ts`, `public/robots.txt` (removed), `src/app/blog/page.tsx`, `src/lib/private-document.ts`.

1. `/robots.txt` contains `Sitemap: https://www.aetherforgeai.co.nz/sitemap.xml` and no Set-Cookie.
2. `/sitemap.xml` has `<lastmod>`, includes `/projections`, omits `/blog`, and lists `/performance` as yearly with lastmod `2026-07-08`. No Set-Cookie.
3. `/blog` still loads, says there are no articles, and is noindex.

### H10 — fixed

Commit: `36b4c80`.  
Files: `src/lib/performance-sample.ts`, `src/app/performance/page.tsx`, `src/components/performance/LiveExamplesGallery.tsx`.

Open `/performance`. Title `Example results · AetherForge AI`. Label `Historical sample, 7–8 Jul 2026`. One 1.98% line: opening `NZ$100,429.00` to day's high `NZ$102,421.30` over about 8–9 hours. Times `9:20 am`, `2:30 pm`, `3:47 pm`.

### H11 — fixed

Commit: `2eb40ee`.  
File: `src/components/TopNav.tsx`.

Open More. Expect Example results `/performance`, Tax `/tax`, Pricing `/pricing`, How it works `/how-it-works`, Projections `/projections`, Trust `/trust`. Markets stays in the bar.

## Not this pull request

| ID | Status |
| --- | --- |
| U1, U2, U4 | Already on develop in `2b7e8e8` (#238). Not edited here. |
| U3, U5 | Already on develop in `e0ecbc9` (#240). Kept during the merge. |
| H1, H2, H3, H4 | Not done here. Other agents. |
| M1–M15 | Not done here. |
| L1–L17 | Not done here. |
| V1, V2, V3 | Verify after publish. Not exercised here. |

Intact on this branch: `preserveDynamicSegmentTraces`, security headers only in `next.config.ts` `headers()`, consent fallback, `reviewedFxAllowed` ±5%, `CRYPTO_SANITY_RATIO` 3, `CRYPTO_PROJECTIONS_PAUSED`, NZ$0 start, fee default `NZ$0.00`. Stox, Koins and Headmaster sections remain. Contacts remain `admin@aetherforgeai.co.nz` and `lukas@aetherforgeai.co.nz`.
