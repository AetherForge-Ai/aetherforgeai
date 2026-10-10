# Pull check — 10 Oct 2026

Retest after Lukas Publishes. This one file covers both batches. It does not Publish, send email, or remove a Stox, Koins, or Headmaster list. No credentials are in this file.

Markers:

- `pull-check:qa-2026-10-10-high-h5-h11`
- `pull-check:qa-2026-10-10-high-h1-h4`

Branch: `cursor/qa-h1-h4-report-logic-f485`
PR: https://github.com/AetherForge-Ai/aetherforgeai/pull/243
H5–H11 landed on develop as https://github.com/AetherForge-Ai/aetherforgeai/pull/242, merge `c72caf8886ac4bc48fec3cc68c505f7d7e6c1079`, tree `264f0f92505e26e322eb45ff81d721646e9fc6ca`. This branch then merged that develop tip. `origin/main` (`b87cefc83783938a13b1382d2e91a00824b5ec51`) is recorded with the ours strategy so the tree stays develop plus this change.

## Needs Lukas

- DNS for `noreply@aetherforgeai.co.nz`, display name AetherForge AI, reply-to `admin@aetherforgeai.co.nz`:
  - TXT `aetherforgeai.co.nz` = `v=spf1 include:<mailbox-host> -all` (one SPF record; merge any existing one)
  - TXT `<selector>._domainkey.aetherforgeai.co.nz` = `v=DKIM1; k=rsa; p=<public key from the mailbox host>` (private key stays with the host)
  - TXT `_dmarc.aetherforgeai.co.nz` = `v=DMARC1; p=none; rua=mailto:admin@aetherforgeai.co.nz; adkim=s; aspf=s`
- Approval before any welcome, report, or trade email is sent. Sending is hard off.
- Publish, when you choose to. This branch does not publish.
- HSTS preload only with your OK. M14 is not this batch, so preload is not added here.
- Confirm the H5 wording: "Apex Dual is a legacy yearly membership" (`dual_yearly`, not a published pricing card, same Headmaster desk as Pro's Full Headmaster).

## H1 — fixed

- Status: fixed
- Commit: `70e3651b506b7576693e7783b4ebf6aab71f906d` (logic), `3fd0a95e292f2e6753454fa04515eb32cae1775c` (on-report list)
- Files: `src/lib/apex.ts`, `src/lib/report-consistency.ts`, `src/lib/report-copy.ts`, `src/components/bots/ApexReport.tsx`, `src/lib/qa-h1-h4.test.ts`
- URL / steps: signed in, `/dashboard`. Open Report Center. Run a full Stox report, then a full Koins report. Read Direct recommendations, Not sized this week, Data-backed observations, Top gainers identified, and the three pathways.
- Expected: no BUY or ACCUMULATE whose own 7-day midpoint is 0 or below. A name that would have been a buy is HOLD, with the sentence "this report does not issue a buy". Every not-sized name has a reason in brackets, for example `ADA (7-day projection -0.54% is not positive)` or `only 2 new names are sized on this tape`. The session sentence names the same ticker and percent as the first row of Top gainers identified, or says standout prints are under review when that list is empty. A Balanced Growth pathway whose target is 0.00% says "does not initiate a position". Projected top 10, not-sized list, pathways, sweeps, synthesis, and strategy are all still present.

## H2 — fixed

- Status: fixed
- Commit: `168bda0d5d164931b085ee0dc8673414afe007ed`, display in `3fd0a95e292f2e6753454fa04515eb32cae1775c`
- Files: `src/lib/quote-review.ts`, `src/lib/apex.ts`, `src/lib/report-html.ts`, `src/components/bots/ApexReport.tsx`
- URL / steps: the same Stox and Koins reports, Full multi-timeframe mover sweep. Find STO.AX, CDW, JPM, and META on the Last 24 hours sweep. Find BAT on a Koins report if it is in the top 10.
- Expected: a large-cap 24-hour move above 20% shows "data under review", not +73.07%, +64.76%, +30.34%, or +28.90%. The rejected row is logged as `[quote-review]`. BAT may still show about +33.16% for 24 hours and a different 7-day projection (those are different windows). The same ticker does not show two different figures for one window. Crypto projections stay paused (`CRYPTO_PROJECTIONS_PAUSED` is still true).

## H3 — fixed

- Status: fixed
- Commit: `023b590a308d8ed218c0d154405ed9aa0f089368`
- Files: `src/lib/sleeve-fill.ts`, `src/lib/totalum-engine.ts`, `src/lib/totalum-service.ts`, `src/app/api/totalum/route.ts`, `src/app/api/totalum/report/route.ts`, `src/components/totalum/TotalumConsole.tsx`, `src/app/headmaster/loading.tsx`, `src/components/dashboard/ReportCenter.tsx`, `src/components/dashboard/AllocationDriftCard.tsx`, `src/components/TopNav.tsx`
- URL / steps: `/dashboard`, then The Headmaster card, and `/headmaster` Strategy. Click Open The Headmaster. On a NZ$100,000.00 book, Balanced Growth, with two qualifying Stox names and one qualifying Koins name, read the sleeve notes.
- Expected: the click shows "Opening The Headmaster…" and the address is `/headmaster` (not `/dashboard/stocks`). While the page loads, the route shows "Opening The Headmaster…". Equities sleeve text is `Equities sleeve: NZ$15,000.00 unallocated: not enough qualifying picks.` A crypto sleeve filled by one name at the 20% cap (NZ$20,000.00 of NZ$20,000.00) has no unallocated sentence. Not-sized names stay listed with their reasons and are not used as silent fills.

## H4 — fixed

- Status: fixed
- Commit: `b604a70e993f1522c2760756520cbe409707e84a`
- Files: `src/components/dashboard/ReportCenter.tsx`, `src/components/dashboard/PortfolioDashboard.tsx`, `src/lib/holdings-generation.ts`, `src/lib/dashboard-surface.ts`
- URL / steps: reload `/dashboard`. Watch Report Center and the Transaction Ledger card before the fetches return. Sell an entire holding (for example PEPE or UNI) and close the dialog without reloading.
- Expected: before `/api/reports` returns, the cadence line says "Loading…" and the history block says "Loading…", not "Ready to run" and not "Your reports 0" with "No reports yet". The ledger shows a skeleton until `/api/transactions` returns, not "No trades yet" beside a cash balance. After the sell dialog closes, the sold holding leaves the table without a manual reload.

## H5 — fixed

- Status: fixed on develop by merge `c72caf8886ac4bc48fec3cc68c505f7d7e6c1079` (#242). Pre-squash commits `ffc6887`, `747609a`.
- Files: `src/lib/plan-usage.ts`, `src/lib/account-plan.ts`, `src/lib/notification-prefs.ts`, `src/app/settings/billing/page.tsx`, `src/app/settings/notifications/page.tsx`, `src/app/billing/page.tsx`, `src/app/api/account/notifications/route.ts`, `src/components/settings/*`, `src/app/pricing/page.tsx`, `src/components/pricing/PricingFAQ.tsx`, `next.config.ts`
- URL / steps:
  1. Sign in and open `/settings/billing`. Expect current plan, renewal, holdings, reports this month, Market Assistant this month.
  2. Free: `n / 10`, `n / 3`, `n / 20`, renewal `No renewal date`. Starter 25 / 15 / 100. Pro 75 / unlimited / 500. Ultimate unlimited / unlimited / unlimited. Apex Dual (`dual_yearly`): name Apex Dual, holdings `n / 20 per bot`.
  3. Open `/billing`. Expect `/settings/billing`.
  4. Open `/pricing`. Expect an Apex Dual note: legacy yearly membership, not a published card, same Headmaster desk as Pro's Full Headmaster. Prices `NZ$0.00`, `NZ$16.00` / `NZ$160.00`, `NZ$49.00` / `NZ$490.00`, `NZ$199.00` / `NZ$1,990.00`. No GST.
  5. Open `/settings/notifications`. Expect Report ready, Trade and ledger, Weekly summary, Product news, all off until opted in. Save text: `Notification choices saved on this browser. No email was sent.`
- Expected: the values in those steps. Lukas confirms the sentence "Apex Dual is a legacy yearly membership".

## H6 — fixed

- Status: fixed on develop by merge `c72caf8886ac4bc48fec3cc68c505f7d7e6c1079` (#242). Pre-squash commit `23079c7`.
- Files: `src/lib/activity-email.ts`, `src/lib/activity-email-server.ts`, `src/lib/report-email-copy.ts`, `src/app/api/account/activity-email/route.ts`, `src/lib/report-service.ts`, `src/lib/trial-report.ts`, `src/app/api/transactions/route.ts`, `src/app/register/page.tsx`, `src/components/dashboard/ReportCenter.tsx`
- URL / steps: run a report on a book with positions. Record a paper trade. Sign up.
- Expected: toast `Report saved below. No report email was sent.` Modal `No report email was sent.` A paper trade writes a server log only and `sent` is false. Signup welcome is a preview to `/api/account/activity-email`. The route does not accept a destination address. `activityEmailSendingEnabled()` is `return false` and does not read the environment.

## H7 — fixed

- Status: fixed on develop by merge `c72caf8886ac4bc48fec3cc68c505f7d7e6c1079` (#242). Pre-squash commit `6079437`.
- Files: `src/lib/route-gate.ts`, `src/middleware.ts`, `src/app/not-found.tsx`
- URL / steps: signed out, open `/nope-404`, `/plans`, `/bots`, then `/settings` and `/headmaster`. Also open `/privacy`, `/how`, and `/live-results`.
- Expected: `/nope-404`, `/plans`, and `/bots` are 404, title `Page not found · AetherForge AI`, og:url ending `/404`. `/settings` and `/headmaster` go to `/login?redirect=…`. `/privacy` → `/privacy-policy`, `/how` → `/how-it-works`, `/live-results` → `/performance`.

## H8 — fixed

- Status: fixed on develop by merge `c72caf8886ac4bc48fec3cc68c505f7d7e6c1079` (#242). Pre-squash commits `e12dd86`, merge `b007e56`.
- Files: `src/lib/tape-display.ts`, `src/lib/crypto-names.ts`, `src/components/MarketTicker.tsx`, `src/components/dashboard/MarketsExplorer.tsx`, `src/lib/crypto-coingecko.ts`, `src/lib/crypto-yahoo.ts`
- URL / steps: open `/` and read the tape. Open `/markets` Crypto.
- Expected: tape items show `US$` or `NZ$`. Show NZ$ is on the page. The rate line is 4 decimal places once today's rate has loaded. BAT is Basic Attention Token, STRK is Starknet, GALA is Gala, THETA is Theta Network, APE is ApeCoin, WLD is Worldcoin, ENJ is Enjin Coin. EOS and IOTA stay those names. Header is Name on crypto and Company on stocks. The DEX tab from U3 remains.

## H9 — fixed

- Status: fixed on develop by merge `c72caf8886ac4bc48fec3cc68c505f7d7e6c1079` (#242). Pre-squash commit `2a5da74`. Cookie strip in middleware is in `6079437`.
- Files: `src/app/sitemap.ts`, `src/app/robots.ts`, `public/robots.txt` (removed), `src/app/blog/page.tsx`, `src/lib/private-document.ts`
- URL / steps: open `/robots.txt`, `/sitemap.xml`, and `/blog`.
- Expected: `/robots.txt` contains `Sitemap: https://www.aetherforgeai.co.nz/sitemap.xml` and no Set-Cookie. `/sitemap.xml` has `<lastmod>`, includes `/projections`, omits `/blog`, and lists `/performance` as yearly with lastmod `2026-07-08`. No Set-Cookie. `/blog` still loads, says there are no articles, and is noindex.

## H10 — fixed

- Status: fixed on develop by merge `c72caf8886ac4bc48fec3cc68c505f7d7e6c1079` (#242). Pre-squash commit `36b4c80`.
- Files: `src/lib/performance-sample.ts`, `src/app/performance/page.tsx`, `src/components/performance/LiveExamplesGallery.tsx`
- URL / steps: open `/performance`.
- Expected: title `Example results · AetherForge AI`. Label `Historical sample, 7–8 Jul 2026`. One 1.98% line: opening `NZ$100,429.00` to day's high `NZ$102,421.30` over about 8–9 hours. Times `9:20 am`, `2:30 pm`, `3:47 pm`.

## H11 — fixed

- Status: fixed on develop by merge `c72caf8886ac4bc48fec3cc68c505f7d7e6c1079` (#242). Pre-squash commit `2eb40ee`. The Headmaster pending label from H3 is kept in the same file.
- Files: `src/components/TopNav.tsx`
- URL / steps: open More.
- Expected: Example results `/performance`, Tax `/tax`, Pricing `/pricing`, How it works `/how-it-works`, Projections `/projections`, Trust `/trust`. Markets stays in the bar.

## L1 — fixed

- Status: fixed
- Commit: `3fd0a95e292f2e6753454fa04515eb32cae1775c` (full report), `b604a70e993f1522c2760756520cbe409707e84a` (dashboard preview)
- Files: `src/components/dashboard/ReportCenter.tsx`, `src/components/bots/ApexReport.tsx`, `src/lib/report-html.ts`, `src/lib/report-copy.ts`
- URL / steps: `/dashboard` Report Center history, then open the full report.
- Expected: the preview does not show raw `**WOR.AX**`, `**ADA**`, `**87%**`, or `_Informational…_`. The full report renders those as bold or italic. The disclaimer still reads as informational market intelligence, not personalised financial advice.

## L2 — fixed

- Status: fixed
- Commit: `70e3651b506b7576693e7783b4ebf6aab71f906d`
- Files: `src/lib/report-consistency.ts`, `src/lib/report-copy.ts`, `src/lib/apex.ts`
- URL / steps: a Stox report on a neutral tape, and an empty-book report.
- Expected: the suitability line says "inside an 8%" (not "inside a 8%"). One new name says "1 named BUY/ACCUMULATE candidate". Two or more say "candidates".

## L3 — fixed

- Status: fixed
- Commit: `70e3651b506b7576693e7783b4ebf6aab71f906d` (sort), test in `023b590a308d8ed218c0d154405ed9aa0f089368`
- Files: `src/lib/apex.ts`, `src/lib/qa-h1-h4.test.ts`
- URL / steps: Koins report, "Next 7 days · Top-10 projected movers".
- Expected: rows are descending by the percent printed on the row. A +24.38% name sits above a +13.90% name. The sweep heading stays "Biggest share-price gainers…" (relabelling that sweep to "Biggest crypto gainers" is M7, not done). The list is still there.

## L4 — fixed

- Status: fixed
- Commit: `023b590a308d8ed218c0d154405ed9aa0f089368`
- Files: `src/lib/totalum-engine.ts`, `src/components/totalum/TotalumConsole.tsx`, `src/lib/totalum-report-html.ts`
- URL / steps: `/headmaster`, Synthesis, on a book that is 100% cash.
- Expected: one concentration line, "Not yet invested. Cash is the whole book, so this is not a concentration score." The diversification tile says "Not yet invested", not "9/100" and not "Highly Concentrated". There is no second 100% cash line. Expected annual return on that book stays 0%.

## L5 — fixed

- Status: fixed
- Commit: `b604a70e993f1522c2760756520cbe409707e84a`
- Files: `src/components/dashboard/ReportCenter.tsx`
- URL / steps: `/dashboard` Report Center, top right of the card. Hover the ticker count.
- Expected: the numbers stay, for example `0 / 51 per bot` and "tickers monitored". The tooltip says the first number is how many you monitor and the second is the plan cap.

## U1 — fixed on develop, verify after publish

- Status: fixed on develop, verify after publish. Not redone here.
- Commit: `2b7e8e86f8c310aa6f15da9cff702797a91c4812` (#238)
- Files: `src/lib/currency.ts`, `src/lib/subcent-price.test.ts`, `src/components/dashboard/HoldingsOwnedTable.tsx`, `src/components/dashboard/TradeReview.tsx`, `src/components/dashboard/TransactionCenter.tsx`, `src/lib/crypto-market.ts`
- URL / steps: record a sub-cent token such as PEPE at US$0.00001. Check holdings, review, sell default, and the ledger.
- Expected: the unit price keeps its significant digits. Totals stay NZ$ to 2 decimal places. No "+99900.00%" and no unit price shown as US$0.01.

## U2 — fixed on develop, verify after publish

- Status: fixed on develop, verify after publish. Not redone here.
- Commit: `2b7e8e86f8c310aa6f15da9cff702797a91c4812` (#238)
- Files: `src/lib/holding-correction.ts`, `src/lib/auckland-correction-date.test.ts`, `src/components/dashboard/StockDialog.tsx`
- URL / steps: Correct this holding, date 10 Oct 2026, including before 1 pm NZDT.
- Expected: the correction saves. The ledger date is 10 Oct 2026, not "the date can't be in the future".

## U3 — fixed on develop, verify after publish

- Status: fixed on develop, verify after publish. Not redone here.
- Commit: `e0ecbc9d39123c249dfa41a57ed18b71c880b75e` (#240)
- Files: `src/components/dashboard/MarketsExplorer.tsx`, `src/hooks/useDexMarkets.ts`, `src/lib/crypto-coingecko.ts`, `src/lib/qa-u3-u5.test.ts`, `src/app/markets/page.tsx`
- URL / steps: `/markets`, Crypto tab, signed in and signed out.
- Expected: top 400 by market cap, a Blockchain column, a DEX top-400 view, "Name" rather than "COMPANY", an Add to paper book action, and no "~90" copy.

## U4 — fixed on develop, verify after publish

- Status: fixed on develop, verify after publish. Not redone here.
- Commit: `2b7e8e86f8c310aa6f15da9cff702797a91c4812` (#238)
- Files: `src/lib/analytics-consent.ts`, `src/components/GoogleTag.tsx`, `src/components/AnalyticsNotice.tsx`, `src/components/CookieSettingsLink.tsx`
- URL / steps: a public page in a fresh browser. Accept, Decline, then Cookie settings.
- Expected: no `googletagmanager` request before Accept. Decline loads no gtag. Cookie settings can change the choice.

## U5 — fixed on develop, verify after publish

- Status: fixed on develop, verify after publish. Not redone here.
- Commit: `e0ecbc9d39123c249dfa41a57ed18b71c880b75e` (#240)
- Files: `src/app/how-it-works/page.tsx`, `src/app/trust/page.tsx`, `src/app/privacy-policy/page.tsx`, `src/app/terms-of-service/page.tsx`, `src/lib/public-copy.ts`
- URL / steps: `/how-it-works`, `/trust`, Privacy §2, Terms §2.
- Expected: one paper-book statement. "AetherForge is a paper book. Real trades happen at your broker. We never move money."

## V1 — verify after publish

- Status: verify after publish. Already on develop in `32b3740f`. Not redone here.
- Commit: `32b3740f`
- Files: none in this pull request
- URL / steps: Add panel, search PEPE and UNI.
- Expected: DEX badge, a live price filled, and no "No price came back".

## V2 — verify after publish

- Status: verify after publish. Already on develop in `32b3740f`. Not redone here.
- Commit: `32b3740f`
- Files: none in this pull request
- URL / steps: dashboard holdings row, Edit pencil, stocks table, crypto table.
- Expected: "Correct this holding" opens, and FX shows 4 decimal places.

## V3 — verify after publish

- Status: verify after publish. Already on develop in `32b3740f`. Not redone here.
- Commit: `32b3740f`
- Files: none in this pull request
- URL / steps: Transaction ledger.
- Expected: the FX column shows 4 decimal places on non-NZD rows.

## M1 — not done

- Status: not done. Another batch. This pull request does not change it.
- Commit: none
- Files: none in this pull request
- URL / steps: Transaction ledger, a correction row, and the CSV export. Open All transactions.
- Expected after a fix: qty and price before → after in the row (for example 9000 at 2.22 → 9000 at 2.21). The note is written once. Tooltip: "Correction adjusts cost basis; cash unchanged." A Corrections filter and a Fee column exist. Until then the row still shows dashes and a duplicated note.

## M2 — not done

- Status: not done. Another batch. This pull request does not change it.
- Commit: none
- Files: none in this pull request
- URL / steps: sell a DEX token, then read the holding row and the ledger.
- Expected after a fix: the source (DEX + chain) stays on the holding, the sell form, and the ledger. Until then the sell path shows "CRYPTO" and holdings say "· Crypto".

## M3 — not done

- Status: not done. Another batch. This pull request does not change it.
- Commit: none
- Files: none in this pull request
- URL / steps: `/login`. Submit email and password on the first quick attempt.
- Expected after a fix: the form does not clear on mount, and a failed submit shows an error. Until then a fast first attempt can wipe email and password with no error.

## M4 — not done

- Status: not done. Another batch. This pull request does not change it.
- Commit: none
- Files: none in this pull request
- URL / steps: a Stox report catalyst line, and the matching Market News card for US CPI.
- Expected after a fix: one date, "14 Oct 2026 (US)" or the same date in both places. Until then the catalyst can say "Tue 13 Oct" while news says "Scheduled: 14 Oct".

## M5 — not done

- Status: not done. Another batch. This pull request does not change it.
- Commit: none
- Files: none in this pull request
- URL / steps: `/projections`, intro and the Nasdaq and crypto tabs.
- Expected after a fix: the intro counts match the tabs (the page shows "Top 30 Nasdaq", not an unmatched "Top 50"), and the crypto pause is explained next to the Koins 7-day outlook. Until then those claims disagree.

## M6 — not done

- Status: not done. Another batch. This pull request does not change it.
- Commit: none
- Files: none in this pull request
- URL / steps: Terms §5 and §6, `/pricing`, `/how-it-works`, and the pricing FAQ.
- Expected after a fix: the 14-day trial is stated once. The annual Excel investor toolkit is either on `/pricing` or removed from Terms. "Your first full report is free" matches Free = 3 reports/month. "Every plan includes email support" matches the plan matrix. Plan numbers stay as they are.

## M7 — not done

- Status: not done. Another batch. This pull request does not change it. L3 did not relabel the sweep.
- Commit: none
- Files: none in this pull request
- URL / steps: home and Docs bot count, the dashboard Smitty line, an ADA market page, and a Koins report sweep heading.
- Expected after a fix: the bot count is settled and Smitty is described as spot and holdings only. The ADA page says "Analyse ADA with Koins". The Koins sweep says "Biggest crypto gainers". Until then home can say "3 AI bots", the ADA page can say "Analyze ADA with Crypto Bot", and the sweep still says "Biggest share-price gainers…".

## M8 — not done

- Status: not done. Another batch. This pull request does not change it.
- Commit: none
- Files: none in this pull request
- URL / steps: `/trust` and Privacy §5/§6 processor lists.
- Expected after a fix: GeckoTerminal is in the processor lists, "licensed market data" matches what is actually used, and "daily briefings you have subscribed to" is removed or described. Until then Trust names GeckoTerminal for DEX tokens and the processor lists name only CoinGecko.

## M9 — not done

- Status: not done. Another batch. This pull request does not change it.
- Commit: none
- Files: none in this pull request
- URL / steps: Privacy title and H1, Terms title, `/pricing` and `/performance` titles.
- Expected after a fix: one name per page and one title separator. Until then Privacy mixes "AI Privacy Policy" with "Privacy Policy", Terms mixes "Terms & Conditions", "Terms" and "Terms of Service", and separators mix "—", "·" and "|".

## M10 — not done

- Status: not done. Another batch. This pull request does not change it.
- Commit: none
- Files: none in this pull request
- URL / steps: Market News, Privacy and Terms dates, a stocks "Updated" line, the ADA chart axis, and the NASDAQ tab time.
- Expected after a fix: dates look like "10 Oct 2026" or "2 Sep 2026" (never "Sept", "September", or "7 October 2026"), and times look like "10 Oct 2026, 3:47 pm" in NZ time. No ISO or UTC string such as `2026-10-10T02:47:53.208Z`.

## M11 — not done

- Status: not done. Another batch. This pull request does not change it.
- Commit: none
- Files: none in this pull request
- URL / steps: dashboard cash, Headmaster amounts, a small loss row, and the drift figure on the dashboard and in Headmaster. Buy a name and compare cost with value.
- Expected after a fix: NZ$ amounts use 2 decimal places (`NZ$100,000.00`, `NZ$0.00`). No "-0.00%" and no "-NZ$0.00". Drift uses "pp" in both places. A fresh buy at the same price shows NZ$0.00 gain.

## M12 — not done

- Status: not done. Another batch. This pull request does not change it.
- Commit: none
- Files: none in this pull request
- URL / steps: view source on `/pricing` before client FX loads.
- Expected after a fix: no "US$ …" placeholder in the server HTML. Either a server-side US$ estimate (FX 4 decimal places) or the line is hidden until it loads.

## M13 — not done

- Status: not done. Another batch. Report prints are H2. This pull request does not change the markets pages for this item.
- Commit: none
- Files: none in this pull request
- URL / steps: the home ticker (TLX.AX) and the NASDAQ tab market-cap column.
- Expected after a fix: a stale quote shows "as of" or is hidden, and US rows show market cap or the column is dropped for that tab. Until then "TLX.AX 15.85 ▲ +0.00%" can look stale and Mkt Cap can be "—" on every US row.

## M14 — not done

- Status: not done. Another batch. Security headers stay only in `next.config` `headers()`. This pull request does not add HSTS preload.
- Commit: none
- Files: none in this pull request
- URL / steps: response headers on a public page, and `/.well-known/security.txt`.
- Expected after a fix: HSTS max-age of at least one year, preload only after Lukas says so, a Permissions-Policy, a script-src CSP that allows gtag only after consent, and a security.txt that points at the contact form. Until then max-age is 86400, security.txt is 404, and those policies are missing.

## M15 — not done

- Status: not done. Another batch. This pull request does not change it.
- Commit: none
- Files: none in this pull request
- URL / steps: `/login`, `/register`, a markets table row, and a holding row read with a screen reader.
- Expected after a fix: login and register each have an h1. Email links have a visible mailto fallback. Duplicate company names are `aria-hidden`. Holding tickers read as "WOR.AX, AUD" and "PFI.NZ, NZD", not "WORAUD" and "PFINZD".

## L6 — not done

- Status: not done. Another batch.
- Commit: none
- Files: none in this pull request
- URL / steps: dashboard onboarding checklist, after a cash deposit.
- Expected after a fix: the count matches the number of steps (4, not "1/3 done"), and "Record your first buys" ticks when holdings or cash are recorded.

## L7 — not done

- Status: not done. Another batch.
- Commit: none
- Files: none in this pull request
- URL / steps: deposit Review dialog.
- Expected after a fix: the "Review" heading does not overlap the subtitle.

## L8 — not done

- Status: not done. Another batch. The Headmaster link loading state is H3 and is fixed. Other tiles are not.
- Commit: none
- Files: none in this pull request
- URL / steps: reload `/dashboard` and watch tiles, the ledger, and metals.
- Expected after a fix: session check and data fetches run together, and index and spot data are cached, so tiles are not still skeletons at 6–16 s.

## L9 — not done

- Status: not done. Another batch.
- Commit: none
- Files: none in this pull request
- URL / steps: export the transactions CSV.
- Expected after a fix: money at 2 decimal places, FX at 4 decimal places, full-precision unit prices, date-times like "10 Oct 2026, 3:47 pm", and FeesNZD, FxSource, and realised price/FX filled. No float artefacts such as "11.223099999999999".

## L10 — not done

- Status: not done. Another batch.
- Commit: none
- Files: none in this pull request
- URL / steps: a WOR lot first bought 1 Oct 2026 and later merged. Open Edit.
- Expected after a fix: the lot keeps "first bought 1 Oct 2026" rather than showing only the later average date.

## L11 — not done

- Status: not done. Another batch.
- Commit: none
- Files: none in this pull request
- URL / steps: a trade form. Type "abc" in quantity, then correct it. Preview a trade that should be blocked.
- Expected after a fix: "Enter a number". The error clears when the input changes. No "cash after" figure is shown before the block.

## L12 — not done

- Status: not done. Another batch.
- Commit: none
- Files: none in this pull request
- URL / steps: dividend action on ADA and on Gold, then a dividend ledger row.
- Expected after a fix: dividends are limited to shares and ETFs, or other assets are labelled Income, and the row shows a date.

## L13 — not done

- Status: not done. Another batch.
- Commit: none
- Files: none in this pull request
- URL / steps: `/tax`, signed in.
- Expected after a fix: the header is not stuck on "Loading market prices…". A summary of dividends and realised P&L is shown, with the IRD disclaimer. Existing IRD content stays.

## L14 — not done

- Status: not done. Another batch.
- Commit: none
- Files: none in this pull request
- URL / steps: `/favicon.ico`, the web manifest, and `/dex`.
- Expected after a fix: favicon and manifest respond. `/dex` is a real page or a 404, not a bounce to login.

## L15 — not done

- Status: not done. Another batch.
- Commit: none
- Files: none in this pull request
- URL / steps: Terms §1.
- Expected after a fix: the host in Terms matches the canonical apex domain.

## L16 — not done

- Status: not done. Another batch.
- Commit: none
- Files: none in this pull request
- URL / steps: `/about`, image URL.
- Expected after a fix: the image is served from a public asset path, not a signed storage URL that expires in 2098.

## L17 — not done

- Status: not done. Another batch.
- Commit: none
- Files: none in this pull request
- URL / steps: Market News, view source and the relevance scores.
- Expected after a fix: more than two cards are in the server HTML, and the scores ("98", "90") have a tooltip. The rest of the page is not stuck on "Loading market prices…".

## Checks

- `npx tsc --noEmit --skipLibCheck`: passed after merging develop `c72caf8886ac4bc48fec3cc68c505f7d7e6c1079`.
- `npx vitest run`: 87 files, 439 tests passed.
- `npm run build` (`next build`): passed. Next.js 15.3.9. Exit 0. The build skipped linting. Better Auth logged that the default secret is in use in this environment; no secret was added.

## Left untouched on purpose

`CRYPTO_PROJECTIONS_PAUSED` remains true. `CRYPTO_SANITY_RATIO` stays 3. Reviewed FX stays ±5%. `preserveDynamicSegmentTraces` is unchanged. Security headers stay in `next.config` `headers()` only. New books still start at NZ$0. The fee default stays NZ$0.00. `auth.ts`, auth mail, transactional mail, and news ingestion were not edited. No email was sent or enabled. Reports describe intelligent AI bots and do not name Grok, ZENITH, or ULTRA. No Totalum AI product name was added. Nothing was published. Contacts remain `admin@aetherforgeai.co.nz` and `lukas@aetherforgeai.co.nz`.
