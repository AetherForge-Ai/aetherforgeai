# Pull check — 10 Oct 2026

Retest after Lukas Publishes. This one file covers both batches. It does not Publish, send email, or remove a Stox, Koins, or Headmaster list. No credentials are in this file.

Markers:

- `pull-check:qa-2026-10-10-high-h5-h11`
- `pull-check:qa-2026-10-10-high-h1-h4`
- `pull-check:qa-2026-10-10-medium-m1-m9`
- `pull-check:qa-2026-10-10-medium-m10-m15-low-l6-l17`
- `pull-check:track-a1-2026-10-10`
- `pull-check:track-a2-2026-10-10`
- `pull-check:track-b-p0-2026-10-11`
- `pull-check:track-b-2-2026-10-11`

Branch: `cursor/qa-m10-m15-l6-l17-b236`
PR: https://github.com/AetherForge-Ai/aetherforgeai/pull/247
H5–H11 landed on develop as https://github.com/AetherForge-Ai/aetherforgeai/pull/242, merge `c72caf8886ac4bc48fec3cc68c505f7d7e6c1079`, tree `264f0f92505e26e322eb45ff81d721646e9fc6ca`. M1–M9 landed on develop as https://github.com/AetherForge-Ai/aetherforgeai/pull/246, merge `5f27fe0445ccda90b7ea4545c88b389401ea48d4`, tree `11bd481b92c7d528f959100a519482129174ad10`. This branch merged that develop tip. `origin/main` (`2abc281528590898dae15f6ee4a59bc9fc0e4edc`, same tree) is recorded with the ours strategy so the tree stays develop plus this change.

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

## M1 — fixed

- Status: fixed. A correction row shows quantity and price before and after. The note is stored once. The ledger tooltip is present. All transactions has a Corrections filter and a Fee column.
- Commit: `bc9f77c`
- Files: `src/lib/holding-correction.ts`, `src/lib/holding-correction.test.ts`, `src/app/api/transactions/export/route.ts`, `src/components/dashboard/TransactionCenter.tsx`
- URL / steps: Transaction ledger, a correction row, the CSV export, and All transactions. Filter to Corrections.
- Expected: the row shows 9000 at 2.22 → 9000 at 2.21. The CSV note is "Correction: 9000 at 2.22 → 9000 at 2.21." once. Tooltip: "Correction adjusts cost basis; cash unchanged." The Fee column is present.

## M2 — fixed

- Status: fixed. A DEX buy keeps the venue and chain without a venue or chain column. The holding stores `DEX · <Chain>` in `stock.sector` (for example `DEX · Ethereum`). The ledger stores `[DEX:<Chain>] ` at the start of `transaction.notes`. The UI strips that prefix from the note and shows venue and chain in their own label. CSV Notes hides the prefix and adds Venue and Chain columns. Sector charts group every `DEX · …` tag as one DEX slice. The ledger DEX label shares the transaction table with M1 (`bc9f77c`).
- Commit: `dfcdb21`, storage follow-up on this branch
- Files: `src/lib/dex-source.ts`, `src/lib/dex-source.test.ts`, `src/lib/dex-storage.test.ts`, `src/lib/trade-schema.ts`, `src/lib/asset-search.ts`, `src/lib/transaction-dialog-store.ts`, `src/lib/portfolio.ts`, `src/lib/transactions.ts`, `src/app/api/transactions/route.ts`, `src/app/api/transactions/export/route.ts`, `src/lib/ledger-schema.ts`, `src/components/dashboard/BuyDialog.tsx`, `src/components/dashboard/MarketsExplorer.tsx`, `src/components/dashboard/HoldingsOwnedTable.tsx`, `src/components/dashboard/PortfolioDashboard.tsx`, `src/components/dashboard/RecordTransactionPanel.tsx`, `src/components/dashboard/TransactionCenter.tsx`
- URL / steps: buy a DEX token (for example PEPE on Ethereum), open the holding row, then sell that holding. Export the ledger CSV.
- Expected: the holding reads "· DEX · Ethereum". The sell badge says DEX plus Ethereum, including when the holding has sector `DEX · Ethereum` and no venue column. The ledger row shows the same source, and the visible note does not start with `[DEX:`. Sector allocation shows DEX once, not one slice per chain. CSV Venue is DEX and Chain is Ethereum.

## M3 — fixed

- Status: fixed. The login form does not remount through a search-params fallback. A failed submit keeps the typed email and password and shows an error.
- Commit: `6488840`
- Files: `src/app/login/page.tsx`, `src/lib/login-draft.ts`, `src/lib/safe-redirect.ts`
- URL / steps: `/login`. Type an email and password and submit on the first attempt. A failed sign-in should leave both fields filled.
- Expected: the fields stay filled and the page shows "Error signing in. Please check your credentials." (or the message returned by sign-in).

## M4 — fixed

- Status: fixed. The Stox catalyst and the BLS news card use the published US CPI day.
- Commit: `396352b`
- Files: `src/lib/us-cpi-schedule.ts`, `src/lib/us-cpi-schedule.test.ts`, `src/lib/econ-calendar.ts`, `src/lib/news-present.ts`
- URL / steps: a Stox report catalyst for the week of 10 Oct 2026, and the Market News card for the BLS CPI schedule.
- Expected: both say "14 Oct 2026 (US)". The news time contains "Scheduled: 14 Oct 2026 (US)". The catalyst does not say "Tue 13 Oct".

## M5 — fixed

- Status: fixed. Projection copy matches the names that came back. Crypto projections stay paused, and the pause names the Koins 7-day outlook.
- Commit: `db91939`
- Files: `src/lib/projection-pause.ts`, `src/components/dashboard/ProjectionsExplorer.tsx`, `src/app/projections/page.tsx`
- URL / steps: `/projections`. Read the intro, the All Markets tab, and the Crypto tab.
- Expected: the intro says each equity tab lists the names that came back, up to 50, and the number on the tab is that count. All Markets says "Up to 50", not "Top 50 combined". The crypto tab says "Crypto projections on this page are paused while a data issue is fixed. Koins still writes a 7-day illustrative outlook on a book that has positions. Live coin prices stay on Markets."

## M6 — fixed

- Status: fixed. Terms §5 states the 14-day trial once. The pricing comparison shows the annual Excel toolkit. Free reports and email support use the shared lines. Plan numbers are unchanged.
- Commit: `bce5aa2`
- Files: `src/lib/public-copy.ts`, `src/app/terms-of-service/page.tsx`, `src/components/pricing/FeatureComparison.tsx`, `src/components/pricing/PricingFAQ.tsx`, `src/app/how-it-works/page.tsx`, `src/lib/p1-public-copy.test.ts`
- URL / steps: Terms §5 and §6, `/pricing` Compare every plan, `/how-it-works`, and the pricing FAQ support answer.
- Expected: Terms §5 shows "Starter and Pro include a 14-day trial and a card is collected at checkout. Cancel anytime." once, then the refund line with no second trial sentence. The comparison row "Excel investor toolkit (annual)" is Annual on Starter, Pro and Ultimate, and absent on Free. How it works says "3 reports a month free, no card." The FAQ says "Every plan — including Free — includes email support."

## M7 — fixed

- Status: fixed. The public count stays three AI bots plus Smitty for spot and holdings only. The ADA action uses Koins. Only the Koins sweep says crypto gainers. The Smitty sentence also lands in `bce5aa2` (`SMITTY_ROLE_LINE` on How it works).
- Commit: `9cfaf23`
- Files: `src/lib/public-copy.ts`, `src/app/page.tsx`, `src/app/how-it-works/page.tsx`, `src/components/bots/BotShowcase.tsx`, `src/components/dashboard/crypto/CoinDetailView.tsx`, `src/components/bots/ApexReport.tsx`, `src/lib/report-html.ts`, `src/lib/mover-sweep.ts`, `src/lib/mover-sweep.test.ts`
- URL / steps: home, How it works, an ADA coin page (`/markets/crypto/cardano` or the ADA detail), and a Koins report sweep. Open a Stox report sweep as well.
- Expected: "3 AI bots plus Smitty, our metals tracker" and "Smitty tracks gold and silver spot prices and holdings only. Smitty does not run a report." The coin button says "Analyse ADA with Koins". The Koins sweep says "Biggest crypto gainers". A Stox sweep still says "Biggest share-price gainers".

## M8 — fixed

- Status: fixed. GeckoTerminal is already in the shared processor list rendered on Trust and Privacy. Public copy says public market data, not licensed market data. Subscribed daily briefings are not described. This commit locks that with a regression test.
- Commit: `51e5509`
- Files: `src/lib/trust-sources.test.ts`, `src/lib/public-copy.ts`, `src/lib/data-sources.ts`, `src/app/trust/page.tsx`, `src/app/privacy-policy/page.tsx`
- URL / steps: `/trust` "Who else handles data", and Privacy §5 and §6.
- Expected: GeckoTerminal is listed for DEX token prices, next to CoinGecko. The sources line says "public market data (Yahoo Finance)". The pages do not say "licensed market data" or "daily briefings you have subscribed to".

## M9 — fixed

- Status: fixed. Document titles use one em dash before AetherForge AI. The Terms page, the register link, Docs, and the AI disclaimer use the name Terms. The Terms title change is in `bce5aa2` because it shares the Terms page with M6. The register link text is in `03b8ba3`.
- Commit: `7515a54`
- Files: `src/lib/page-title.ts`, `src/lib/page-title.test.ts`, `src/lib/reviewed-book.ts`, `src/app/privacy-policy/page.tsx`, `src/app/terms-of-service/page.tsx`, `src/app/pricing/page.tsx`, `src/app/performance/page.tsx`, `src/app/docs/page.tsx`, `src/app/ai-disclaimer/page.tsx`, `src/app/not-found.tsx`, `src/components/dashboard/MarketsPageContent.tsx`, `src/app/register/page.tsx`
- URL / steps: the browser title on Privacy, Terms, `/pricing`, and `/performance`. Read the Terms H1, the Docs link, and the register consent link.
- Expected: "Privacy Policy — AetherForge AI", "Terms — AetherForge AI", "Pricing — AetherForge AI", "Example results — AetherForge AI". The Terms H1 is "Terms". Docs and register say "Terms".

## Register redirect — fixed

- Status: fixed. `/register?redirect=` keeps a same-origin relative path on the verified-email "Go to Log In" link and on "Sign in here". `https://`, `//`, `/\`, and an encoded `//` are dropped.
- Commit: `03b8ba3`
- Files: `src/app/register/page.tsx`, `src/lib/safe-redirect.ts`, `src/lib/login-draft.test.ts`, `src/app/login/page.tsx`
- URL / steps: open `/register?redirect=%2Fmarkets%2Fcrypto%2Fada%3Fbuy%3D1`, complete sign-up until the check-your-email panel, and use Go to Log In.
- Expected: the link is `/login?redirect=%2Fmarkets%2Fcrypto%2Fada%3Fbuy%3D1`. After a successful login the browser goes to `/markets/crypto/ada?buy=1`.

## M10 — fixed

- Status: fixed
- Commit: `e67a42e` (NASDAQ clock also in `d95e230`)
- Files: `src/lib/currency.ts`, `src/lib/public-copy.ts`, `src/lib/news-present.ts`, `src/lib/market-freshness.ts`, `src/components/dashboard/crypto/CoinDetailView.tsx`, `src/components/dashboard/ActionableIntelligence.tsx`, `src/components/dashboard/ProjectionsPanel.tsx`, `src/components/dashboard/MarketWidePerformers.tsx`, `src/app/changelog/page.tsx`, `src/components/settings/SettingsClient.tsx`
- URL / steps: Market News, Privacy and Terms updated lines, a stocks Updated line, an ADA chart axis, and a closed NASDAQ tab.
- Expected: `2026-10-10T02:47:53.208Z` prints `10 Oct 2026, 3:47 pm`. September prints `Sep`. Legal updated line is `7 Oct 2026`. A closed session does not add a second `09:00 am` clock. The CPI release name still says September 2026.

## M11 — fixed

- Status: fixed
- Commit: `1cf571d`, `a73662c`, `58c2cb9`
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
- Expected: money is 2 decimal places (`14999.60`, not a float tail), FX is 4 decimal places, unit prices keep stored precision, DateTime_NZ is `10 Oct 2026, 3:47 pm`, FeesNZD and FxSource are filled, and a sell with a blank note says it was recorded on the paper book. A repeated correction sentence is stored once. A `[DEX:<Chain>]` prefix is removed from Notes. Venue and Chain are the columns after Notes.

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

## Track A1

Retest of the published build. These rows supersede the earlier H1, H2, H3, and H5 rows where the retest still failed. Stox, Koins, and Headmaster lists stay. Crypto projections stay paused.

### U3 — partial

- Status: partial. CoinGecko top 400 when the feed answers. The DEX list is whatever GeckoTerminal returned within its rate limit and may be under 400. Each GeckoTerminal page holds 20 pools, so 400 unique tokens need 20 or more pages. A cold tab fetches up to 5 pages at a time and returns within about 3 seconds with the rows that arrived. The CDN keeps that merged list (`s-maxage` and `stale-while-revalidate`). A later HTTP 429 does not replace a longer cached list with a shorter one. `CRYPTO_SANITY_RATIO` stays 3 and is not applied to this list.
- Commit: `7690a58`, `ac2a97b`
- Files: `src/lib/crypto-coingecko.ts`, `src/lib/crypto-source.ts`, `src/lib/crypto-market.ts`, `src/lib/crypto-names.ts`, `src/lib/crypto-dex.ts`, `src/lib/crypto-coverage.ts`, `src/components/dashboard/MarketsExplorer.tsx`, `src/components/dashboard/MarketsPageContent.tsx`, `src/app/api/crypto/dex/route.ts`, `src/app/how-it-works/page.tsx`
- URL / steps: signed out, `/markets?tab=crypto`, then the DEX tab. Read the intro, the count under the search, the Blockchain column, the first page of names, and the DEX button. Also read Koins on `/how-it-works`.
- Expected, CoinGecko returns 400: the count line is `The top 400 coins by market cap`. There is no short-list notice. Blockchain is `Native` or a platform name, not `—` on every row. These names are not the raw ticker: Mina Protocol, Axie Infinity, Kusama, EOS Network, Flow, Internet Computer, Aave, Zilliqa, Artificial Superintelligence Alliance, Curve DAO, Synthetix, yearn.finance, Ankr, Filecoin, Arkham.
- Expected, CoinGecko returns N under 400 (backup example N = 89): the count line is `The top 89 coins by market cap`. Backup notice: `CoinGecko did not return a market list (rate limit or the feed did not answer). This list is the backup feed: 89 coins, not 400.` Page-2 notice: `CoinGecko did not return the second page (rate limit or plan cap). Showing N, not 400.` The intro and the count do not say Top 400.
- Expected, DEX returns N under 400 (example N = 33): the button is `DEX top 33`. The subtitle is `Top 33 DEX tokens by 24-hour volume · GeckoTerminal`. While more pages can still load: `GeckoTerminal returned 33 tokens, not 400. Further rows are still loading.` When the rate limit stops the walk: `GeckoTerminal returned 33 tokens, not 400. The rate limit stopped the list.` Do not show `DEX top 400` or `Top 400 DEX tokens`.
- Expected, DEX returns 400: the button is `DEX top 400`. The subtitle is `Top 400 DEX tokens by 24-hour volume · GeckoTerminal`. The notice is empty.
- Expected, DEX returns 0: the button is `DEX`. The subtitle is `DEX list · GeckoTerminal returned 0 tokens, not 400`. The empty cell is `GeckoTerminal did not return a token price (rate limit or the feed did not answer). This list is 0, not 400.`
- Expected, how-it-works: Koins says `Tracks up to 400 coins, depending on what the data feed returns`. It does not say `Tracks the top 400 coins`.

### V1 — fixed

- Status: fixed
- Commit: `4b4801e`
- Files: `src/lib/crypto-quote.ts`, `src/app/api/tickers/quote/route.ts`
- URL / steps: signed in. Add a holding. Search PEPE and UNI. Choose the DEX row. Read the price hint. Compare with a sell of a holding that already has a price.
- Expected: PEPE and UNI use the same coin-list price the sell form uses when GeckoTerminal search has no print. A search price is used when it is present. The hint is "Today's price is filled in." when a price comes back. An unknown pool id stays strict.

### H1 — fixed

- Status: fixed
- Commit: `39e5c0d` (rating), `03b2813` (report assembly)
- Files: `src/lib/report-consistency.ts`, `src/lib/report-copy.ts`, `src/lib/apex.ts`, `src/components/bots/ApexReport.tsx`
- URL / steps: signed in, `/dashboard`. Run Koins, then Stox. Read the recommendation, the briefing, the momentum count, Balanced Growth, and the projected list.
- Expected: one record per ticker. ADA with a 7-day midpoint of -0.63% is HOLD on the card, the recommendation, and the briefing. Both momentum lines say 0 of 1. The sentence is "does not issue a buy." and is not cut off at "does not issue a." A pathway target of -0.63% says it does not initiate a position. MAH.AX can lead the projected percents and its signal is not a buy. Projected top 10, not-sized names, pathways, and sweeps remain.

### H2 — fixed

- Status: fixed
- Commit: `03b2813`, `5deed22`
- Files: `src/lib/quote-review.ts`, `src/lib/apex.ts`, `src/lib/report-copy.ts`, `src/components/bots/ApexReport.tsx`, `src/lib/report-html.ts`
- URL / steps: the same Stox and Koins reports. Full multi-timeframe mover sweep and the projected list. Read the note under each window.
- Expected: large-cap caps are 20% (24h), 35% (7d) and 60% (30d). If a ticker's 24h print is withheld, its 7d and 30d prints are withheld too. These prints are data under review and are not in the top 10 or the projected leaders: LRCX +43.68% and AMGN +42.23% (24h), MDLZ +50.64% (7d), JPM +31.01% (7d, because JPM's 24h print is withheld), META +32.46% (7d, because META's 24h print is withheld), WETH +77.98%, USDG +27.66%, CRVUSD +29.82%. Each window that dropped rows says `N prints under review` (for example `4 prints under review`), counted before those rows leave the ranking. A large-cap 30-day move of +25% with a normal 24h print is shown, not hidden. A wrapped token that tracks its underlying, and a stablecoin move of a few tenths of a percent, can still show. BAT +33.16% (24h) can still show.

### H3 — fixed

- Status: fixed
- Commit: `24e9643`
- Files: `src/lib/headmaster-trust.ts`, `src/lib/totalum-engine.ts`, `src/app/api/totalum/route.ts`, `src/components/totalum/TotalumConsole.tsx`
- URL / steps: signed in, `/headmaster`. Open Synthesis, then Strategy.
- Expected: cash on book keeps cents (NZ$33,291.47, not NZ$33,291.00). When qualifying names cannot fill a sleeve, both tabs show the unallocated amount, for example "Equities sleeve: NZ$15,000.00 unallocated: not enough qualifying picks." A sleeve the qualifying names fill has no sentence. Synthesis and Strategy both remain.

### H5 — fixed

- Status: fixed
- Commit: `230f3e8`
- Files: `src/lib/plan-usage.ts`, `src/lib/account-plan.ts`, `src/components/settings/SettingsClient.tsx`, `src/lib/entitlements.ts` (unchanged helper, now used by billing and profile)
- URL / steps: signed in. Open Plan & billing, the profile ticker line, and the dashboard holdings count.
- Expected: all three use `resolveTickerLimit`. An Apex Dual account stamped 51 shows "4 / 51 per bot" on billing when 4 holdings are in use, "51 per bot" on the profile, and "4 / 51 per bot" on the dashboard. Without a stamp, Apex Dual stays "20 per bot".

### Checks for Track A1

- `./node_modules/.bin/tsc --noEmit --skipLibCheck`: passed.
- `./node_modules/.bin/vitest run`: 101 files, 483 tests passed.
- `./node_modules/.bin/eslint` on the Track A1 source files: 0 errors.
- `npm run build` (`next build`): passed. Exit 0. Nothing was published.

## Checks

- `./node_modules/.bin/tsc --noEmit --skipLibCheck`: passed after the merge of develop `5f27fe04`.
- `./node_modules/.bin/vitest run`: 96 files, 472 tests passed after that merge. The M1 single correction note and the DEX badge / hidden `[DEX:<Chain>]` prefix tests passed in the CSV and the ledger.
- `./node_modules/.bin/eslint` on the files in this batch: 0 errors. Three existing unused-disable warnings remain in `NewsFeed.tsx` and `CoinDetailView.tsx`.
- `npm run build` (`next build`): passed after that merge. Next.js 15.3.9. Exit 0. The build skipped linting. Better Auth logged that the default secret is in use in this environment; no secret was added.

## Track A2 — retest of the published build

This section is the 10 Oct retest for Track A2 only. Older rows above stay as they were. Where this section names a different expected value, this section is the one to retest. Crypto projections stay paused. Nothing here publishes, sends email, or removes a Stox, Koins, or Headmaster list.

Marker: `pull-check:track-a2-2026-10-10` in `src/lib/holding-correction.ts` and in the Markers list.

### M1 — fixed

- Status: fixed
- Commit: `ccf9e36`, decimal follow-up `06f4427`
- Files: `src/lib/holding-correction.ts`, `src/lib/holding-correction.test.ts`, `src/components/dashboard/TransactionCenter.tsx`, `src/lib/transaction-csv.ts`, `src/lib/transactions.ts`, `src/app/api/stocks/[id]/route.ts`
- URL / steps: signed in, edit PFI.NZ from 9000 at NZ$2.22 to 9000 at NZ$2.21, open the ledger row, export the CSV.
- Expected: the row reads `9000 at NZ$2.22 → 9000 at NZ$2.21` and shows `Correction adjusts cost basis; cash unchanged.` The CSV note is one line: `Correction: 9000 at NZ$2.22 → 9000 at NZ$2.21. Cash unchanged.`

### M10 / L9 — fixed

- Status: fixed
- Commit: `356ad16`, follow-up `66b1719`
- Files: `src/lib/executed-at.ts`, `src/lib/auckland-noon.ts`, `src/lib/transaction-csv.ts`, `src/lib/transactions.ts`, `src/lib/ledger-audit.ts`, `src/lib/ledger-schema.ts`, `src/lib/currency.ts`, `src/app/api/metals/[id]/route.ts`, `src/app/api/transactions/export/route.ts`, `src/app/api/stocks/route.ts`, `src/lib/qa-m10-l17.test.ts`
- URL / steps: record a trade today and a metal or share move dated 9 Oct 2026. Export the ledger CSV.
- Expected: a real execution prints Auckland time, for example `10 Oct 2026, 3:47 pm`. A date with no clock prints the date only (`9 Oct 2026` or `10 Oct 2026`), never `1:00 pm` or `1:00 am`. A past date-only save is stored as noon Pacific/Auckland, for example `2026-10-01T12:00:00+13:00` in October and `2026-07-01T12:00:00+12:00` in July, because a Totalum date field wants an instant. The screen and the CSV still show the date only. Audit notes use `10 Oct 2026`, not `10/10/2026`. Money is 2 decimal places, FX is 4, unit prices keep their stored digits. Notes do not contain a long float such as `7476.61570345871`. Numeric cells stay empty when a figure was not stored (`SignalPrice`, `MarkPriceAtExport`, and a sell's price/FX split). The reason is in `Data note`, so a spreadsheet sum of those columns still works. A buy that is not a sell shows `0.00` in the realised columns.

### M11 — fixed

- Status: fixed
- Commit: `18fb5f8`
- Files: `src/lib/currency.ts`, `src/lib/portfolio.ts`, `src/lib/report-html.ts`, `src/components/bots/ApexReport.tsx`, `src/lib/qa-m10-l17.test.ts`
- URL / steps: buy WOR.AX today at the same price the book shows. Open a Stox report that includes PFI.NZ.
- Expected: a fresh buy at the same 4-decimal price shows `AU$0.00` and `0.00%`, and the NZ$ value matches the NZ$ cost. A 0.004 gap on 100,000 shares stays `+NZ$400.00`. Report prices show a currency and 2 decimal places (`NZ$2.22`). Extra digits appear only under one cent.

### L7 — fixed

- Status: fixed
- Commit: `b0092f4`
- Files: `src/components/dashboard/RecordTransactionPanel.tsx`, `src/lib/asset-search.ts`, `src/lib/record-transaction.test.ts`
- URL / steps: open Record a transaction, choose Deposit. Search `PFI` on a buy first if you want to see rank, then switch to Deposit and review.
- Expected: the amount starts empty. Review says Asset `Cash` and the amount is NZD only. It does not name Invesco or PFI. Searching `PFI` lists `PFI.NZ` before the US fund. The Review heading sits under its subtitle.

### L8 — fixed

- Status: fixed
- Commit: `ec2c2e3`, cash follow-up `66b1719`
- Files: `src/lib/book-cache.ts`, `src/lib/transactions.ts`, `src/lib/transaction-rules.ts`, `src/app/api/stocks/route.ts`, `src/components/dashboard/RecordTransactionPanel.tsx`, `src/components/dashboard/PortfolioDashboard.tsx`
- URL / steps: reload `/dashboard` and the ledger. Open Review on a deposit while cash is still loading.
- Expected: dashboard figures show `Loading…` until the book returns. Ledger, cash, sells, and dividends are read together, and a repeat read within 12 seconds uses the cache. A trade clears that cache. Review is not blocked by `Cash is still loading.` It shows `Checking cash…`, then either the balance or `Cash is still loading. Confirm checks the balance before anything is written.` If that load fails, the server still refuses a buy, withdrawal, or tax line that would take cash below zero. That check reads the account balance. It does not trust the client's cash flag.

### L10 — fixed

- Status: fixed
- Commit: `798ff9e`
- Files: `src/app/api/stocks/route.ts`, `src/app/api/stocks/[id]/route.ts`, `src/lib/transactions.ts`
- URL / steps: buy WOR.AX dated 1 Oct 2026, then buy more on 10 Oct 2026. Correct PFI.NZ and revert the correction.
- Expected: WOR still says `first bought 1 Oct 2026`. The stored `purchase_date` for that past day is noon Auckland (`2026-10-01T12:00:00+13:00`), and the label stays the date. PFI stays on its earliest buy date. A correction does not write `purchase_date`.

### H8 — fixed

- Status: fixed
- Commit: `6e23cb7`
- Files: `src/lib/crypto-names.ts`, `src/lib/tape-display.test.ts`
- URL / steps: `/markets`, crypto table, page 1.
- Expected: MINA, AXS, KSM, FLOW, ICP, AAVE, ZIL, ARKM, FET, CRV, SNX, YFI, ANKR, and FIL show names (Mina Protocol, Axie Infinity, Kusama, Flow, Internet Computer, Aave, Zilliqa, Arkham, Artificial Superintelligence Alliance, Curve DAO, Synthetix, yearn.finance, Ankr, Filecoin). EOS shows EOS Network. Currency and NZ$ toggle stay as they were.

### M15 — fixed

- Status: fixed
- Commit: `de3e6de`
- Files: `src/app/login/page.tsx`, `src/app/register/page.tsx`
- URL / steps: `/login` and `/register`. View the page heading.
- Expected: each page has an `h1` (`Sign in`, `Create an account`, or `Check your email`). It is visually hidden. Sign-in and register behaviour is unchanged.

### M5 — fixed

- Status: fixed
- Commit: `2edc702`
- Files: `src/components/dashboard/ProjectionsExplorer.tsx`
- URL / steps: projections, Crypto tab.
- Expected: the tab stays `Paused`. The page says `Crypto projections are paused` and keeps the existing pause message. `CRYPTO_PROJECTIONS_PAUSED` is still true.

### M6 — fixed

- Status: fixed
- Commit: `3e7d856`, copy follow-up `dd236d1`
- Files: `src/lib/public-copy.ts`, `src/lib/plans.ts`, `src/app/terms-of-service/page.tsx`, `src/components/pricing/PricingCards.tsx`, `src/components/pricing/FeatureComparison.tsx`, `src/components/dashboard/YearlyToolkit.tsx`, `src/components/TopNav.tsx`, `src/app/stripe/success/page.tsx`, `src/app/how-to-maximize-results/page.tsx`, `src/app/api/downloads/toolkit/route.ts`
- URL / steps: Terms §6, and `/pricing` on monthly and annual.
- Expected: yearly billing includes a downloadable Excel investor toolkit template. Terms §6, the annual pricing cards, and the comparison row `Excel investor toolkit template` (`Yearly` on Starter, Pro, and Ultimate; absent on Free) say that. The file is a blank template. It is not filled with holdings, and it is not a copy of the ledger. `Transaction CSV export` stays on every plan. The download route allows yearly plans (`yearly`, `dual_yearly`, `starter_yearly`, `pro_yearly`, `ultimate_yearly`) and refuses monthly plans.

### Decision — Excel toolkit template

Lukas may later decide to retire the downloadable Excel investor toolkit template. Until that decision, yearly plans keep the download. The route still streams the static workbook.

### M7 — fixed

- Status: fixed
- Commit: `3e7d856` (home sentence) and `bed591a` (bot heading)
- Files: `src/lib/public-copy.ts`, `src/components/bots/BotShowcase.tsx`
- URL / steps: `/` and the bot section.
- Expected: `Three AI bots — Stox, Koins and The Headmaster. Smitty tracks gold and silver spot and holdings only.` Smitty is not described as a fourth AI bot.

### M13 — fixed

- Status: fixed
- Commit: `16d988b`
- Files: `src/components/MarketTicker.tsx`
- URL / steps: home ticker, TLX.AX.
- Expected: a flat stale quote says `No change figure · as of 9 Oct 2026` (or the real quote date). It does not invent a 0.00% move.

### M14 — fixed

- Status: fixed, by keeping the current policy
- Commit: `146b2ec`
- Files: `src/lib/security-headers.ts`
- URL / steps: response headers on `/`.
- Expected: `script-src` stays on `Content-Security-Policy-Report-Only`. It is not enforced, because Next inline scripts and the consent-gated gtag have no nonce. There is no `X-Frame-Options`. `frame-ancestors` still allows `'self'`, `https://web.totalum.app`, and `https://totalum-frontend-test.web.app`, so the Totalum preview keeps working.

### L16 — fixed

- Status: fixed
- Commit: `373f58b`
- Files: `assets/files.ts`, `src/assets/files.ts`, `src/components/about/AboutContent.tsx`, `public/brand/about-hero.jpg`
- URL / steps: `/about`, hero image request.
- Expected: the hero is `/brand/about-hero.jpg` on this site, not `images.unsplash.com`. The page notes the Unsplash Licence. The photograph is the same landscape the page already described. Unsplash does not require a photographer credit, and this page did not name one.

### 404 share URL — fixed

- Status: fixed
- Commit: `373f58b`
- Files: `src/app/not-found.tsx`, `src/lib/route-gate.test.ts`
- URL / steps: open a missing URL such as `/nope-404` and read `og:url`.
- Expected: the 404 response does not set `og:url` or a canonical to `/404`. The title stays `Page not found — AetherForge AI`. This replaces the earlier H7 expectation that `og:url` would end in `/404`.

## Track A2 checks

- Merged `origin/develop` `caa54724` (tree `0f771ef2`) and recorded `origin/main` `1e0a38fc` with the ours strategy. The tree is develop plus the Track A2 changes.
- `./node_modules/.bin/tsc --noEmit --skipLibCheck`: passed after that merge.
- `./node_modules/.bin/vitest run`: 101 files, 486 tests passed.
- `npm run build` (`next build`, Next.js 15.3.9): passed. Exit 0. The build skipped linting. Better Auth logged that the default secret is in use in this environment; no secret was added.

## Left untouched on purpose

`CRYPTO_PROJECTIONS_PAUSED` remains true. `CRYPTO_SANITY_RATIO` stays 3. Reviewed FX stays ±5%. `preserveDynamicSegmentTraces` is unchanged. Security headers stay in `next.config` `headers()` only. New books still start at NZ$0. The fee default stays NZ$0.00. This branch did not edit `src/lib/auth.ts`, auth mail, transactional mail, the send-verification route, or news ingestion. Register and login arrived with the #246 merge. Email sending stays hard off. No email was sent. Reports describe intelligent AI bots and do not name a model or a provider. No Totalum AI product name was added. Nothing was published. Contacts remain `admin@aetherforgeai.co.nz` and `lukas@aetherforgeai.co.nz`.

## Track B P0

Branch `cursor/track-b-p0-bb35` from develop `87dfce1`. PR https://github.com/AetherForge-Ai/aetherforgeai/pull/255. Marker `pull-check:track-b-p0-2026-10-11` is in `src/lib/public-copy.ts` and in the Markers list above. Local checks on 11 Oct 2026 (NZ): `npm run check-types-errors` passed, eslint on the changed source files passed, `npm test` passed (102 files, 493 tests), `npm run build` passed. Curl figures below are from `next start` on this machine, not from the live site. Nothing was published. No email was sent.

### P0-1 — not changed

- Status: not changed. No clear cause outside the signup mail files this batch was told not to edit.
- Commit: none
- Files: read only. `src/lib/auth.ts` sets `emailVerification.sendVerificationEmail` to `sendAuthVerificationEmail`. `src/lib/send-transactional-mail.ts` posts `html` and keeps `text` off the payload. The send-verification route and `auth-mail.ts` / `transactional-mail.ts` are the rest of that path.
- URL / steps: a fresh signup, timed on a live inbox. That timing is separate from this branch.
- Expected: a message with a body and a working link in under 60 seconds.
- Partial: this branch does not change that path, so it does not claim the live timing.

### P0-2 — fixed

- Status: fixed
- Commit: `5e9ee8f48f03e67a29c15edd68034f5415269550` for the footer, About, and Terms. Privacy and Trust list both addresses in `109cff756f61705b77eb98c2b785831409ebee99`.
- Files: `src/lib/public-copy.ts`, `src/components/SiteFooter.tsx`, `src/components/EmailAddress.tsx` (unchanged; it already prints the mailto and the "at" line), `src/components/about/AboutContent.tsx`, `src/app/terms-of-service/page.tsx`, `src/app/privacy-policy/page.tsx`, `src/app/trust/page.tsx`
- URL / steps: open `/markets` (the footer is on every page), `/about#contact`, `/terms-of-service` section 17, `/privacy-policy` contact, `/trust` vulnerability.
- Expected: `admin@aetherforgeai.co.nz` and `lukas@aetherforgeai.co.nz`, each as a mailto, plus the words "admin at aetherforgeai.co.nz" and "lukas at aetherforgeai.co.nz". Terms also shows phone `0800 238 437`.
- Checked here: the local `/markets` HTML contains both mailto links, both "at" lines, and `href="/status"`.

### P0-3 — written, Lukas decides

- Status: options written. No option is chosen.
- Commit: `ae21b3182f2ce8db4d087a0c62cf14290a87f2f7`
- Files: `docs/data-licensing-options-2026-10-11.md` (force-added; `/docs/` is gitignored)
- URL / steps: read the file. It is not a site page.
- Expected: options only, from the code and from vendor pages fetched on 11 Oct 2026. It does not claim an NZX or ASX licence.
- Partial: CoinGecko API terms and pricing returned a challenge page, so those clauses are marked UNVERIFIED. The GeckoTerminal API terms page was not fetched. Swyftx terms were not fetched. Frankfurter's fetched docs name `api.frankfurter.dev` while the code calls `api.frankfurter.app`.

### P0-4 — fixed on this machine

- Status: fixed in the local production server. Review follow-up: the equity wait is 3 seconds, a stored snapshot is served at once, and a later read refreshes it in the background. A refresh that does not replace that snapshot waits 60 seconds before another try. A cold miss still prints "No prices in this response."
- Commit: `d08381a62b1bfd1c407ccc031e3b1a9fc3e73c9b`. Review follow-up `d0530cc812029408fdc2cd3c9f7019cd04b81fbf`. Backoff `18f1f9d`.
- Files: `src/lib/public-market-index.ts`, `src/lib/public-market-types.ts`, `src/lib/sitemap-tickers.ts`, `src/components/markets/PublicMarketTables.tsx`, `src/components/dashboard/MarketsPageContent.tsx`, `src/app/markets/page.tsx`, `src/app/markets/stock/[ticker]/page.tsx`, `src/app/markets/crypto/[id]/page.tsx`, `src/app/sitemap.ts`
- URL / steps: `curl` `/markets`, `/markets/stock/FBU.NZ`, and `/sitemap.xml`.
- Expected: at least 50 `data-price-row` rows and an as-of time in the markets HTML. The sitemap lists ticker paths.
- Checked here: after the review build, a cold `/markets` returned 230 `data-price-row` rows in 2.06 s (time to first byte 2.06 s). The next read of the same process returned the same 230 rows in 0.03 s. As-of lines on the earlier read included `as of 9 Oct 2026, 4:55 pm` (NZX), `as of 9 Oct 2026, 6:12 pm` (ASX), `as of 10 Oct 2026, 9:00 am` (Dow Jones and NASDAQ), and `as of 11 Oct 2026, 12:51 am` (crypto, from the feed's `last_updated`). Sitemap listed `/status`, 397 `/markets/stock/` paths, and 20 `/markets/crypto/` paths. `FBU.NZ` HTML included the name Fletcher Building, the Materials list on NZX, `FBU.NZ NZ$3.42 0.00% as of 9 Oct 2026, 4:59 pm`, the title `Fletcher Building (FBU) · NZX — AetherForge AI`, and a link to create an account. The signed-out page does not show the add link.
- Partial: 25 DEX rows say `change not stated` and `as of not stated by the vendor`, because that feed has no change and no quote time. Six equity rows printed `0.00%`. A blank vendor response says `No prices in this response.` Neither local read had an empty tab, because the feed returned rows inside the 3 second wait. The live site was not curled.
- Sitemap choice: keep the stock paths and put a real listing on each page (name, exchange, sector from the repo list, price with as-of when the feed returns one, and a link to add the name or create an account, plus a title and description that use that name). The repo list has no market-cap field, so a "top 100 by market cap" cut would have been a guess. The pages stay force-dynamic.

### P0-5 — fixed on this machine

- Status: fixed in the local production server. Headline probes from #234 still pass.
- Commit: `8b2d8764eb4608a3f6850986fab24c689d9c9d5e`
- Files: `src/components/MarketTicker.tsx`, `src/lib/yahoo-finance.ts`, `src/lib/news-present.ts`, `src/lib/news-present.test.ts`, `src/lib/market-news.ts`, `src/components/dashboard/MarketNewsPageContent.tsx`
- URL / steps: home tape after `/api/ticker` returns; `/market-news` five times; the news unit tests.
- Expected: every tape row has a change percent. The three marginal shapes (Trump Dividend, a digital-assets Zero opinion, a Vietnam asset-manager profile) are off-topic. A Vietnam index move stays. `/market-news` time to first byte under 0.8 s on five fetches.
- Checked here: `/api/ticker` returned changes such as AIR.NZ `+1.30%` and SPK.NZ `-1.49%`, with `quotedAt` `2026-10-09T03:55:00.000Z`. The cell always prints `formatSignedPercent`. `/market-news` time to first byte was 0.534 s, then 0.019 s, 0.023 s, 0.012 s, and 0.011 s. The first HTML had 20 headings, including the RBNZ 2.75% card and the scheduled CPI card, plus NZ lines (Squirrel plans to list; NZX-listed company) and US market headlines.
- Partial: some of those 20 are US opinion columns that still match a market word. This batch does not drop every Motley Fool dividend story. The 0.8 s figure is this machine, not Cloudflare. A feed that exceeds 500 ms is dropped for that request and is not cached unless at least eight live stories arrived.

### P0-6 — fixed, retention left for Lukas

- Status: public wording fixed after the second review. The first two wordings left out coach and Headmaster categories the routes send. Vendor retention is still not stated on the site.
- Commit: `109cff756f61705b77eb98c2b785831409ebee99`. The processor name is also in `5e9ee8f48f03e67a29c15edd68034f5415269550`. Review follow-up `3779e8b0da4f73ffbc24ddb386f2209c90ce2304`. Category follow-up `6fefefe`.
- Files: `src/app/trust/page.tsx`, `src/app/privacy-policy/page.tsx`, `src/components/chat/ChatAssistant.tsx`, `src/components/dashboard/TickerAnalysisPane.tsx`, `src/components/trial/TrialReportView.tsx`, `docs/ai-disclosure-for-lukas-2026-10-11.md`
- URL / steps: `/trust` section "What the AI does", Privacy section 4, a ticker note, the assistant, and a trial note when `aiEnhanced` is true.
- Expected: the page says a third-party AI service writes the labelled plain-English notes. It lists the assistant holding count, total market value, total cost, total unrealised profit or loss, best and worst performer, sector weights, and for each holding the ticker, name, sector, share count, average price, current price, value, profit or loss, and weight. For the Portfolio Execution Coach it also lists the diversification score and its label, allocation values in NZ$, the top eight positions with name, asset class, weight and value, the latest Stox and Koins findings, and the Headmaster ideas for names in the book. For the Headmaster chat it also lists total value, total cost and profit or loss, each asset class with its value and position count, the top eight positions with name, asset class, weight, value and profit or loss, concentration-risk notes, the bull, base and bear scenario pathways, the diversification score and HHI, a calculated yearly return and volatility, the illustrated cash reallocation, and the Headmaster ideas block. A ticker note includes the question you typed. It says the request does not include a card number, and that the sending code does not set a retention period. It does not name a model or a provider. Retention and training at the service are "to be confirmed by Lukas" in the page-free note only. `AI_SENT_CATEGORIES` in `src/lib/public-copy.ts` is the typed list, and the test fails if one of those phrases is missing from the lines.
- Partial: a stored member report still sets `aiEnhanced` to false. Its summary is the rules text, not the "AI-written note" label. Whether the live host has the API variable set is UNVERIFIED (`wrangler.jsonc` does not set it). The Lukas note now says "the trial summary function in src/lib/trial-report.ts" and does not use the old function identifier.

### P0-7 — fixed

- Status: fixed
- Commit: `4b37113c19c83ba69145c9523e655a3efc9e4d2c`. The footer Status link is in `5e9ee8f48f03e67a29c15edd68034f5415269550`. Sitemap `/status` is in `d08381a62b1bfd1c407ccc031e3b1a9fc3e73c9b`.
- Files: `src/app/changelog/page.tsx`, `src/app/status/page.tsx`, `src/lib/route-gate.ts`, `src/components/SiteFooter.tsx`, `src/app/sitemap.ts`
- URL / steps: `/changelog`, `/status`, footer Status link.
- Expected: one line each for the develop commits on 10 Oct 2026 and 11 Oct 2026. No 9 Oct line, because `git log origin/develop` has no commit that day. Status says "Status updates are posted here." and links `/trust` and `/changelog`. It does not say "All systems normal".
- Partial: there is no health check in the repo, so the page does not report uptime.

### Track B checks

- `npm run check-types-errors`: passed.
- eslint on the changed source files: passed, no output.
- `npm test`: 102 files, 494 tests passed after the category follow-up (`6fefefe`), including the typed category list.
- `npm run check-types-errors`: passed again after that follow-up.
- `npm run build`: passed again after that follow-up (Next.js 15.3.9). The build skipped its own lint step. Better Auth logged the default secret in this environment. No secret was added.
- This batch did not edit `src/lib/auth.ts`, `src/lib/auth-mail.ts`, `src/lib/transactional-mail.ts`, `src/lib/send-transactional-mail.ts`, or the send-verification route. It did edit the news filter and the news fetch cap. Crypto projections stay paused. No list was removed. No email was sent. Nothing was published.

## Track B item 2

NZ tax pack. Draft PRs only. Nothing here publishes, sends email, or removes a Stox, Koins, or Headmaster list. Crypto projections stay paused. Prices stay NZ$0 / NZ$16 / NZ$49 / NZ$199. No new database columns. Marker `pull-check:track-b-2-2026-10-11` is in `src/lib/dividend-ledger.ts`, `src/lib/tax-disclaimer.ts`, `src/lib/nz-tax-year.ts`, `src/lib/taxable-income.ts`, `src/lib/fif-working-paper.ts`, `src/lib/tax-realised.ts`, and the Markers list above.

### TB-2a — dividend ledger

- Status: in this draft
- Files: `src/lib/dividend-ledger.ts`, `src/lib/dividend-ledger.test.ts`, `src/lib/tax-disclaimer.ts`, `src/lib/tax-book-server.ts`, `src/app/tax/dividends/page.tsx`, `src/components/tax/DividendLedgerView.tsx`, `src/app/api/tax/dividends/export/route.ts`, `src/app/api/tax/fx/route.ts`, `src/lib/transactions.ts`, `src/lib/trade-schema.ts`
- URL / steps: signed in, open `/tax/dividends`. Record a dividend on a holding you already have. Then export the CSV.
- Expected, NZ holding, payment date 10 Oct 2026, gross 100.00, imputation credits 28.00, withholding 33.00, DRP 0, rate 1.0000: the row shows gross NZ$100.00, imputation credits NZ$28.00, withholding NZ$33.00, DRP NZ$0.00, FX 1.0000, net cash NZ$67.00. Imputation is not taken off the cash. The visible note does not start with `[DIV:`. The CSV line is `10 Oct 2026,<ticker>,stock,NZD,1.0000,100.00,28.00,33.00,0.00,67.00,"Indicative, not tax advice."`
- Expected, AUD holding, gross 100.00, imputation 0, withholding 15.00, DRP 20.00, rate 1.0912: gross NZ$109.12, withholding NZ$16.37, DRP NZ$21.82, net cash NZ$70.93. Working: 100 × 1.0912 = 109.12; 15 × 1.0912 = 16.368 rounds to 16.37; 20 × 1.0912 = 21.824 rounds to 21.82; 109.12 − 16.37 − 21.82 = 70.93.
- Expected, an older dividend with no prefix and cash NZ$25.00: gross, credits, withholding and DRP are blank (an em dash on the page, empty CSV cells). Cash stays NZ$25.00 and is not added into gross.
- Expected, the page says `Indicative, not tax advice.` Signed out, the page has no sample row and says no dividends are recorded until you sign in. `/tax` still says it does not yet produce tax reports until TB-2d.
- DRP does not change the share count. That is left for Lukas.
- Checked on this branch: `npm run check-types-errors` passed. eslint on the TB-2a source files passed. `npm test` 103 files, 502 tests passed. `npm run build` passed (Next.js 15.3.9). A local `next start` of `/tax/dividends` returned the indicative label, "No dividends recorded", and a sign-in link. It did not contain a sample amount or `[DIV:`. `/tax` still contains "does not yet produce tax reports". Nothing was published. No email was sent.

### TB-2b — taxable-income export

- Status: in this draft
- Files: `src/lib/nz-tax-year.ts`, `src/lib/taxable-income.ts`, `src/lib/taxable-income.test.ts`, `src/app/tax/income/page.tsx`, `src/app/api/tax/income/export/route.ts`
- URL / steps: signed in, open `/tax/income`. Choose the year `1 Apr 2026 to 31 Mar 2027`. Export the CSV. Print the page.
- Expected, that year contains FBU.NZ on 1 Apr 2026 (gross 100.00, imputation credits 28.00, withholding 33.00, DRP 0.00), CBA.AX on 10 Oct 2026 (gross 109.12, imputation credits 0.00, withholding 16.37, DRP 21.82, rate 1.0912), and a sell of AAPL on 15 Jan 2027 with stored realised 40.50. Totals: gross NZ$209.12, imputation credits NZ$28.00, withholding NZ$49.37, DRP NZ$21.82, realised NZ$40.50.
- Expected, a dividend on 31 Mar 2026 stays in the year ending 31 Mar 2026. A sell on 1 Apr 2027 stays in the year ending 31 Mar 2028. They are not in the 2027 totals.
- Expected, a dividend with cash NZ$25.00 and no breakdown is not added to gross. A sell with no stored realised amount is blank, not NZ$0.00.
- Expected, the CSV total line is `1 Apr 2026 to 31 Mar 2027,,,total,209.12,28.00,49.37,21.82,40.50,"Indicative, not tax advice."` The page says `Indicative, not tax advice.`
- Realised on this page is the amount stored on the sell. FIFO is TB-2d.

### TB-2c — indicative FIF working paper

- Status: in this draft
- Files: `src/lib/fif-working-paper.ts`, `src/lib/fif-working-paper.test.ts`, `src/app/tax/fif/page.tsx`, `src/components/tax/FifWorkingPaper.tsx`, `src/app/api/tax/fif/route.ts`
- URL / steps: signed in, open `/tax/fif`. Choose `1 Apr 2026 to 31 Mar 2027`. Enter opening and closing market values only for a holding you already have. Print the page. Do not expect a live price to fill 1 April or 31 March.
- Expected, AAPL bought 1 Jun 2025, 100 shares at US$10.00, stored rate 1.6000, still held, opening market value NZ$1,800.00, closing market value NZ$2,000.00, and a dividend in that year with stored gross NZ$50.00 and no other buys or sells in the year: cost NZ$1,600.00 (100 × 10 × 1.6000). Fair dividend rate NZ$90.00 (1,800.00 × 0.05). Comparative value NZ$250.00, which is (2,000.00 + 50.00) − (1,800.00 + 0.00). The cost test says `Highest attributing cost in this income year is NZ$1,600.00. That is under NZ$50,000.00.`
- Expected, the same AAPL cost plus CBA.AX cost NZ$10,000.00, FBU.NZ, and a crypto lot: the peak stays NZ$1,600.00. CBA.AX is listed under Australian listings with no fair dividend rate and no comparative value. FBU.NZ is listed as left out. Crypto is left out.
- Expected, 4,000 shares at US$10.00 and rate 1.2500: 4,000 × 10 × 1.2500 = NZ$50,000.00. The sentence says `That is exactly NZ$50,000.00.` One more share at the same price and rate makes the peak NZ$50,012.50 and the sentence says `That is over NZ$50,000.00.`
- Expected, buy 100 AAPL at US$10.00 rate 1.6000 on 1 May 2026, then sell 40 at US$12.00 rate 1.6000 on 1 Jun 2026: remaining cost NZ$960.00, peak cost NZ$1,600.00, sale proceeds NZ$768.00 (40 × 12 × 1.6000). Fair dividend rate stays 5% of the opening value you entered. A quick sale adjustment is not calculated. With opening NZ$1,800.00 and closing NZ$2,000.00, comparative value is −NZ$632.00: (2,000.00 + 768.00) − (1,800.00 + 1,600.00).
- Expected, a foreign attributing buy with no stored rate: cost is `Not recorded` and the page says `The $50,000 cost test is not calculated because a foreign attributing buy has no stored exchange rate.` A blank opening market value is `Not recorded`, not NZ$0.00. An entered opening of 0.00 gives a fair dividend rate of NZ$0.00.
- Expected, an empty book says `No attributing overseas shares on this book.` It does not say the cost is under NZ$50,000.00.
- Expected, saving market values changes only `stock.notes`, in the form `[FIFMV:2027:o=1800.00;c=2000.00]`. The rest of the note stays. The page does not show `[FIFMV:`. The page says `Indicative, not tax advice.`
- Sources on the page: Inland Revenue foreign investment funds, the exemptions page, the section CQ 5 article, TDS 26/01, and TDS 23/13.
- Checked on this branch: `npm run check-types-errors` passed. eslint on the TB-2c source files passed. `npm test` 105 files, 514 tests passed. `npm run build` passed (Next.js 15.3.9). A local `next start` of `/tax/fif` returned the indicative label, the FIF title, a sign-in link, and the Inland Revenue foreign investment funds link. It did not contain a sample cost or `[FIFMV:`. `/tax` still contains "does not yet produce tax reports" until TB-2d. Nothing was published. No email was sent.

### TB-2d — realised profit and loss

- Status: in this draft
- Files: `src/lib/tax-realised.ts`, `src/lib/tax-realised.test.ts`, `src/app/tax/realised/page.tsx`, `src/app/api/tax/realised/export/route.ts`, `src/components/tax/TaxPageContent.tsx`
- URL / steps: signed in, open `/tax/realised`. Choose `1 Apr 2026 to 31 Mar 2027`. Export the CSV. Then open `/tax` and confirm the old sentence is gone.
- Expected, FBU.NZ buy 10 at NZ$2.00 on 1 May 2026, buy 10 at NZ$3.00 on 1 Jun 2026, sell 15 at NZ$4.00 on 1 Aug 2026, rate 1.0000, sell fee NZ$0.00: price gain NZ$25.00, FX gain NZ$0.00, realised NZ$25.00. Working: 10 × (4.00 − 2.00) = 20.00, plus 5 × (4.00 − 3.00) = 5.00.
- Expected, the same sell with a sell fee of NZ$1.00: price gain stays NZ$25.00 and realised is NZ$24.00. Buy fees are not added on top of the stored buy price.
- Expected, ETH buy 2 at US$100.00 rate 1.6000 on 2 Apr 2026, sell 1 at US$150.00 rate 1.7000 on 1 Sep 2026: price gain NZ$85.00 (1 × (150 − 100) × 1.7000), FX gain NZ$10.00 (1 × 100 × (1.7000 − 1.6000)), realised NZ$95.00. Crypto is in its own section.
- Expected, both books in the year ending 31 Mar 2027: other total NZ$25.00, crypto total NZ$95.00, combined NZ$120.00. The CSV combined line is `1 Apr 2026 to 31 Mar 2027,,,combined,,,,,120.00,"Indicative, not tax advice."`
- Expected, the remaining 5 FBU.NZ sold on 1 Apr 2027 at NZ$4.00 stay in the year ending 31 Mar 2028, realised NZ$5.00. They are not in the 2027 combined total. A correction row is not replayed.
- Expected, a foreign buy with no stored rate makes the later sell blank, not NZ$0.00, and that blank is not added into the total.
- Expected, `/tax` no longer says it does not yet produce tax reports. `/tax`, `/tax/dividends`, `/tax/income`, `/tax/fif` and `/tax/realised` each show `Indicative, not tax advice.` The taxable-income page still says its realised column is the amount stored on the sell, and it links to this FIFO paper.
- CSV uses the same paid-plan gate as the transaction export. That gate is left for Lukas.
- Checked on this branch: `npm run check-types-errors` passed. eslint on the TB-2d source files passed. `npm test` 106 files, 521 tests passed. `npm run build` passed (Next.js 15.3.9). A local `next start` returned 200 for `/tax`, `/tax/dividends`, `/tax/income`, `/tax/fif` and `/tax/realised`. Each showed `Indicative, not tax advice.` `/tax` did not contain "does not yet produce tax reports" and linked to the four papers. `/tax/realised` signed out showed a sign-in link and no sample gain. `GET /api/tax/realised/export` with no session returned 401. Nothing was published. No email was sent.

