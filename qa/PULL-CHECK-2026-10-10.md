# Pull check — 10 Oct 2026

Retest after Lukas Publishes. This one file covers both batches. It does not Publish, send email, or remove a Stox, Koins, or Headmaster list. No credentials are in this file.

Markers:

- `pull-check:qa-2026-10-10-high-h5-h11`
- `pull-check:qa-2026-10-10-high-h1-h4`
- `pull-check:qa-2026-10-10-medium-m10-m15-low-l6-l17`

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

## M10 — fixed

- Status: fixed
- Commit: `e67a42e` (NASDAQ clock also in `d95e230`)
- Files: `src/lib/currency.ts`, `src/lib/public-copy.ts`, `src/lib/news-present.ts`, `src/lib/market-freshness.ts`, `src/components/dashboard/crypto/CoinDetailView.tsx`, `src/components/dashboard/ActionableIntelligence.tsx`, `src/components/dashboard/ProjectionsPanel.tsx`, `src/components/dashboard/MarketWidePerformers.tsx`, `src/app/changelog/page.tsx`, `src/components/settings/SettingsClient.tsx`
- URL / steps: Market News, Privacy and Terms updated lines, a stocks Updated line, an ADA chart axis, and a closed NASDAQ tab.
- Expected: `2026-10-10T02:47:53.208Z` prints `10 Oct 2026, 3:47 pm`. September prints `Sep`. Legal updated line is `7 Oct 2026`. A closed session does not add a second `09:00 am` clock. The CPI release name still says September 2026.

## M11 — fixed

- Status: fixed
- Commit: `1cf571d`, `a73662c`, review fix on this branch
- Files: `src/lib/currency.ts`, `src/lib/portfolio.ts`, `src/lib/headmaster-trust.ts`, `src/components/totalum/TotalumConsole.tsx`, `src/components/dashboard/AllocationDriftCard.tsx`, `src/components/dashboard/PreciousMetals.tsx`, `src/components/dashboard/PortfolioDashboard.tsx`, `src/components/dashboard/HoldingsOwnedTable.tsx`
- URL / steps: dashboard cash, Headmaster amounts, drift on the dashboard and in Headmaster, a same-day buy whose stored unit price matches, and a large lot with a 0.004 price gap. Also a non-NZ$ token position whose native gain is under one cent.
- Expected: NZ$ totals stay at 2 decimal places: `NZ$100,000.00` and `NZ$0.00`. No `-0.00%` and no `-NZ$0.00`. Drift is `pp` in both places. A same-day fill whose unit price still matches after stored precision (at least 6 decimal places) uses one rounding path and the gain is `NZ$0.00`. A gap that only disappears at 2 decimal places is a real gain: 100,000 shares times 0.004 stays `+NZ$400.00`. A non-NZ$ native gain under one cent keeps significant digits (`+US$0.0000040399`), not `US$0.00`.

## M12 — fixed

- Status: fixed
- Commit: `5f03370`
- Files: `src/app/pricing/page.tsx`, `src/components/pricing/PricingCards.tsx`, `src/app/settings/page.tsx`, `src/components/settings/SettingsClient.tsx`, `src/hooks/useFxRates.ts`
- URL / steps: view source on `/pricing` and the plan switcher in Settings.
- Expected: the string `US$ …` is not in the HTML. When the cached FX snapshot has a time, the server HTML includes a US$ line at 4 decimal places. Otherwise the line stays hidden.

## M13 — fixed

- Status: fixed
- Commit: `d95e230`
- Files: `src/components/MarketTicker.tsx`, `src/components/dashboard/MarketsExplorer.tsx`
- URL / steps: the home ticker, including a stale TLX.AX print, and the NASDAQ market-cap column.
- Expected: a quote older than 18 hours with a 0.00% move shows `as of` and is not painted as a live up-move. The market-cap column is omitted unless most rows have a cap.

## M14 — fixed

- Status: fixed. X-Frame-Options is omitted on purpose. script-src is report-only on purpose. `security.txt` was already present.
- Commit: `5457f47`
- Files: `src/lib/security-headers.ts` (applied only from `next.config` `headers()`), `public/.well-known/security.txt`
- URL / steps: response headers on a public page, and `/.well-known/security.txt`.
- Expected: `Strict-Transport-Security: max-age=31536000; includeSubDomains` with no preload. `Permissions-Policy` includes camera, microphone, geolocation, and usb. The enforcing CSP remains `frame-ancestors 'self' https://web.totalum.app https://totalum-frontend-test.web.app` so the Totalum preview still loads. There is no `X-Frame-Options`, because SAMEORIGIN or DENY would block that preview. `Content-Security-Policy-Report-Only` is `script-src 'self' https://www.googletagmanager.com` without `unsafe-inline`, so Next inline scripts and the consent-gated tag are not blocked. security.txt contacts `admin@aetherforgeai.co.nz` and expires `2027-10-08`. Canonical host is the apex.

## M15 — partial

- Status: partial. Login and register headings are the other batch. Those pages were not edited.
- Commit: `6bad140`, `a73662c`, `d95e230`
- Files: `src/components/EmailAddress.tsx`, `src/components/SiteFooter.tsx`, `src/app/trust/page.tsx`, `src/app/privacy-policy/page.tsx`, `src/app/terms-of-service/page.tsx`, `src/app/ai-disclaimer/page.tsx`, `src/components/about/AboutContent.tsx`, `src/components/dashboard/HoldingsOwnedTable.tsx`, `src/components/dashboard/PortfolioDashboard.tsx`, `src/components/dashboard/MarketsExplorer.tsx`
- URL / steps: footer, Trust, Privacy, Terms, the AI disclaimer, About, a markets row, and a holding row. Do not use this pull request to judge `/login` or `/register` h1s.
- Expected: each mailto keeps a visible `name at host` line. Duplicate market names are `aria-hidden`. A holding reads `WOR.AX, AUD` or `PFI.NZ, NZD`.

## L6 — fixed

- Status: fixed
- Commit: `13e5cf7`
- Files: `src/lib/onboarding-steps.ts`, `src/components/dashboard/OnboardingChecklist.tsx`
- URL / steps: dashboard onboarding after a cash deposit and no holding.
- Expected: a pro desk shows `1/4 done`. Record your first buys is ticked for cash or a holding. The card still hides when the required steps are done, even if Headmaster is open.

## L7 — partial

- Status: partial. Spacing was increased. This environment did not open the dialog in a browser.
- Commit: `8f7b569`
- Files: `src/components/dashboard/RecordTransactionPanel.tsx`, `src/components/dashboard/TransactionDialog.tsx`
- URL / steps: open a deposit, then Review.
- Expected: the Review heading uses `leading-snug` and space under the subtitle. The dialog title has extra right padding so the close control does not cover it.

## L8 — partial

- Status: partial. Public feeds are warmed and cached. Private book data still waits for the session. Tile timing was not measured in a browser.
- Commit: `436183d`
- Files: `src/lib/public-feed-cache.ts`, `src/lib/api.ts`, `src/components/dashboard/DashboardSessionShell.tsx`, `src/components/markets/NzsxMarketPage.tsx`
- URL / steps: reload `/dashboard`. The session check starts `/api/metals/spot` and `/api/market-snapshot` without awaiting them.
- Expected: those two public responses are reused for 45 seconds. Holdings are not painted before the session matches. No new request waits on the session check before the public fetch starts.

## L9 — fixed

- Status: fixed
- Commit: `68a5ac0`
- Files: `src/lib/transaction-csv.ts`, `src/app/api/transactions/export/route.ts`
- URL / steps: export the transactions CSV on a paid plan.
- Expected: money is 2 decimal places (`14999.60`, not a float tail), FX is 4 decimal places, unit prices keep stored precision, DateTime_NZ is `10 Oct 2026, 3:47 pm`, FeesNZD and FxSource are filled, and a sell with a blank note says it was recorded on the paper book.

## L10 — fixed

- Status: fixed
- Commit: `73bd18c`, `a73662c`
- Files: `src/lib/transactions.ts`, `src/lib/transaction-rules.ts`, `src/components/dashboard/PortfolioDashboard.tsx`, `src/components/dashboard/HoldingsOwnedTable.tsx`
- URL / steps: merge a 1 Oct buy into a WOR lot dated 10 Oct, then read the holding row.
- Expected: the stored day stays `2026-10-01` and the row says `first bought 1 Oct 2026`.

## L11 — fixed

- Status: fixed
- Commit: `8f7b569`
- Files: `src/lib/transaction-rules.ts`, `src/components/dashboard/RecordTransactionPanel.tsx`
- URL / steps: type `abc` in quantity, then change it. Preview a blocked movement.
- Expected: the message is `Enter a number.` `-5` still says the quantity must be greater than zero. The message clears when the field changes. Cash after is hidden while the movement is blocked.

## L12 — fixed

- Status: fixed
- Commit: `8f7b569`
- Files: `src/lib/income-label.ts`, `src/components/dashboard/RecordTransactionPanel.tsx`, `src/components/dashboard/TransactionCenter.tsx`
- URL / steps: choose Dividend on ADA or Gold, then read the ledger row.
- Expected: shares and ETFs say Dividend. Crypto, metal, and cash say Income. The ledger type stays dividend. The row shows the date.

## L13 — fixed

- Status: fixed
- Commit: `3f006c0`, `d95e230`
- Files: `src/lib/tax-book.ts`, `src/app/tax/page.tsx`, `src/components/tax/TaxPageContent.tsx`, `src/components/MarketTicker.tsx`
- URL / steps: `/tax` while signed in.
- Expected: the ticker request gives up after 8 seconds instead of sitting on a loading line. A loaded book shows dividends and realised P&L (a test book of NZ$25.00 and -NZ$10.86) and says Inland Revenue decides. Existing IRD sections stay. If the book cannot be read, the summary is omitted rather than invented.

## L14 — fixed

- Status: fixed. `/favicon.ico` was already a real 32×32 icon.
- Commit: `d163592`
- Files: `src/app/layout.tsx`, `public/site.webmanifest`, `src/lib/route-gate.test.ts`, `public/favicon.ico`
- URL / steps: `/favicon.ico`, `/site.webmanifest`, and `/dex`.
- Expected: the document head points at `/favicon.ico` and `/site.webmanifest`. `documentAccess("/dex")` is `missing`, so the route is a 404 and not a login redirect.

## L15 — fixed

- Status: fixed
- Commit: `6bad140`
- Files: `src/app/terms-of-service/page.tsx`
- URL / steps: Terms §1.
- Expected: the host is `aetherforgeai.co.nz`.

## L16 — fixed

- Status: fixed
- Commit: `96f2f74`
- Files: `assets/files.ts`, `src/assets/files.ts`, `public/brand/founder-portrait.jpeg`
- URL / steps: `/about`, image URL.
- Expected: the portrait is `/brand/founder-portrait.jpeg`.

## L17 — partial

- Status: partial. The page server-renders the loaded feed when that feed has more than two cards. This environment did not confirm a live feed, so the fallback is the two official cards. The relevance tooltip is in place.
- Commit: `28c5c74`
- Files: `src/app/market-news/page.tsx`, `src/components/dashboard/MarketNewsPageContent.tsx`, `src/components/dashboard/NewsFeed.tsx`
- URL / steps: `/market-news`, view source, and a relevance score.
- Expected: when the news feed returns more than two stories, those stories are in the first HTML. Otherwise the two official cards are. A score has the title `Relevance is an AetherForge tag from 0 to 100. It is not a recommendation.` News ingestion was not edited.

## Checks

- `./node_modules/.bin/tsc --noEmit --skipLibCheck`: passed (re-run after the #247 review fix).
- `./node_modules/.bin/vitest run`: 88 files, 453 tests passed (re-run after the #247 review fix).
- `./node_modules/.bin/eslint` on the files in this batch: 0 errors. Three existing unused-disable warnings remain in `NewsFeed.tsx` and `CoinDetailView.tsx`.
- `npm run build` (`next build`): passed, including a re-run after the #247 review fix. Next.js 15.3.9. Exit 0. The build skipped linting. Better Auth logged that the default secret is in use in this environment; no secret was added.

## Left untouched on purpose

`CRYPTO_PROJECTIONS_PAUSED` remains true. `CRYPTO_SANITY_RATIO` stays 3. Reviewed FX stays ±5%. `preserveDynamicSegmentTraces` is unchanged. Security headers stay in `next.config` `headers()` only. New books still start at NZ$0. The fee default stays NZ$0.00. `src/lib/auth.ts`, auth mail, transactional mail, the send-verification route, news ingestion, and the register and login pages were not edited. Email sending stays hard off. No email was sent. Reports describe intelligent AI bots and do not name Grok, ZENITH, or ULTRA. No Totalum AI product name was added. Nothing was published. Contacts remain `admin@aetherforgeai.co.nz` and `lukas@aetherforgeai.co.nz`.
