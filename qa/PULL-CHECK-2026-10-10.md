# Pull check — 10 Oct 2026

Retest after Lukas Publishes. This branch is `cursor/qa-h1-h4-report-logic-f485`. It does not Publish, send email, or remove a Stox, Koins, or Headmaster list.

Marker: `pull-check:qa-2026-10-10-high-h1-h4`

Lukas: Publish this pull request when it is merged. No email approval, branded-sender DNS, or HSTS preload is requested by this batch. No credentials are in this file.

## This batch

### H1 — fixed

- Commit: `70e3651b506b7576693e7783b4ebf6aab71f906d` (logic), `3fd0a95e292f2e6753454fa04515eb32cae1775c` (on-report list)
- Files: `src/lib/apex.ts`, `src/lib/report-consistency.ts`, `src/lib/report-copy.ts`, `src/components/bots/ApexReport.tsx`, `src/lib/qa-h1-h4.test.ts`
- URL: signed in, `/dashboard`. Open Report Center. Run a full Stox report, then a full Koins report. Open each report.
- Steps: read Direct recommendations, Not sized this week, Data-backed observations, Top gainers identified, and the three pathways.
- Expected: no BUY or ACCUMULATE whose own 7-day midpoint is 0 or below. A name that would have been a buy is HOLD, with the sentence "this report does not issue a buy". Every not-sized name has a reason in brackets, for example `ADA (7-day projection -0.54% is not positive)` or `only 2 new names are sized on this tape`. The session sentence names the same ticker and percent as the first row of Top gainers identified, or says standout prints are under review when that list is empty. A Balanced Growth pathway whose target is 0.00% says "does not initiate a position". Projected top 10, not-sized list, pathways, sweeps, synthesis, and strategy are all still present.

### H2 — fixed

- Commit: `168bda0d5d164931b085ee0dc8673414afe007ed`, display in `3fd0a95e292f2e6753454fa04515eb32cae1775c`
- Files: `src/lib/quote-review.ts`, `src/lib/apex.ts`, `src/lib/report-html.ts`, `src/components/bots/ApexReport.tsx`
- URL: the same Stox and Koins reports, Full multi-timeframe mover sweep.
- Steps: find STO.AX, CDW, JPM, and META on the Last 24 hours sweep. Find BAT on a Koins report if it is in the top 10.
- Expected: a large-cap 24-hour move above 20% shows "data under review", not +73.07%, +64.76%, +30.34%, or +28.90%. The rejected row is logged as `[quote-review]`. BAT may still show about +33.16% for 24 hours and a different 7-day projection (those are different windows). The same ticker does not show two different figures for one window. Crypto projections stay paused (`CRYPTO_PROJECTIONS_PAUSED` is still true).

### H3 — fixed

- Commit: `023b590a308d8ed218c0d154405ed9aa0f089368`
- Files: `src/lib/sleeve-fill.ts`, `src/lib/totalum-engine.ts`, `src/lib/totalum-service.ts`, `src/app/api/totalum/route.ts`, `src/app/api/totalum/report/route.ts`, `src/components/totalum/TotalumConsole.tsx`, `src/app/headmaster/loading.tsx`, `src/components/dashboard/ReportCenter.tsx`, `src/components/dashboard/AllocationDriftCard.tsx`, `src/components/TopNav.tsx`
- URL: `/dashboard` then The Headmaster card, and `/headmaster` Strategy.
- Steps: click Open The Headmaster. On a NZ$100,000.00 book, Balanced Growth, with two qualifying Stox names and one qualifying Koins name, read the sleeve notes.
- Expected: the click shows "Opening The Headmaster…" and the address is `/headmaster` (not `/dashboard/stocks`). While the page loads, the route shows "Opening The Headmaster…". Equities sleeve text is `Equities sleeve: NZ$15,000.00 unallocated: not enough qualifying picks.` A crypto sleeve filled by one name at the 20% cap (NZ$20,000.00 of NZ$20,000.00) has no unallocated sentence. Not-sized names stay listed with their reasons and are not used as silent fills.

### H4 — fixed

- Commit: `b604a70e993f1522c2760756520cbe409707e84a`
- Files: `src/components/dashboard/ReportCenter.tsx`, `src/components/dashboard/PortfolioDashboard.tsx`, `src/lib/holdings-generation.ts`, `src/lib/dashboard-surface.ts`
- URL: `/dashboard`, then a sell from the holdings table.
- Steps: reload `/dashboard`. Watch Report Center and the Transaction Ledger card before the fetches return. Sell an entire holding (for example PEPE or UNI) and close the dialog without reloading.
- Expected: before `/api/reports` returns, the cadence line says "Loading…" and the history block says "Loading…", not "Ready to run" and not "Your reports 0" with "No reports yet". The ledger shows a skeleton until `/api/transactions` returns, not "No trades yet" beside a cash balance. After the sell dialog closes, the sold holding leaves the table without a manual reload.

### L1 — fixed

- Commits: `3fd0a95e292f2e6753454fa04515eb32cae1775c` (full report), `b604a70e993f1522c2760756520cbe409707e84a` (dashboard preview)
- Files: `src/components/dashboard/ReportCenter.tsx`, `src/components/bots/ApexReport.tsx`, `src/lib/report-html.ts`, `src/lib/report-copy.ts`
- URL: `/dashboard` Report Center history, and the opened report.
- Steps: read a saved report preview, then open the full report.
- Expected: the preview does not show raw `**WOR.AX**`, `**ADA**`, `**87%**`, or `_Informational…_`. The full report renders those as bold or italic. The disclaimer still reads as informational market intelligence, not personalised financial advice.

### L2 — fixed

- Commit: `70e3651b506b7576693e7783b4ebf6aab71f906d`
- Files: `src/lib/report-consistency.ts`, `src/lib/report-copy.ts`, `src/lib/apex.ts`
- URL: a Stox report on a neutral tape, and an empty-book report.
- Expected: the suitability line says "inside an 8%" (not "inside a 8%"). One new name says "1 named BUY/ACCUMULATE candidate". Two or more say "candidates".

### L3 — fixed

- Commit: `70e3651b506b7576693e7783b4ebf6aab71f906d` (sort), test in `023b590a308d8ed218c0d154405ed9aa0f089368`
- Files: `src/lib/apex.ts`, `src/lib/qa-h1-h4.test.ts`
- URL: Koins report, "Next 7 days · Top-10 projected movers".
- Expected: rows are descending by the percent printed on the row. A +24.38% name sits above a +13.90% name. The sweep heading stays "Biggest share-price gainers…" (that relabel is M7, not this batch). The list is still there.

### L4 — fixed

- Commit: `023b590a308d8ed218c0d154405ed9aa0f089368`
- Files: `src/lib/totalum-engine.ts`, `src/components/totalum/TotalumConsole.tsx`, `src/lib/totalum-report-html.ts`
- URL: `/headmaster`, Synthesis, on a book that is 100% cash.
- Expected: one concentration line, "Not yet invested. Cash is the whole book, so this is not a concentration score." The diversification tile says "Not yet invested", not "9/100" and not "Highly Concentrated". There is no second 100% cash line. Expected annual return on that book stays 0%.

### L5 — fixed

- Commit: `b604a70e993f1522c2760756520cbe409707e84a`
- Files: `src/components/dashboard/ReportCenter.tsx`
- URL: `/dashboard` Report Center, top right of the card.
- Expected: the numbers stay, for example `0 / 51 per bot` and "tickers monitored". Hovering the count explains that the first number is how many you monitor and the second is the plan cap.

## Already on develop — verify after publish

Do not redo these. Confirm them on the build Lukas Publishes.

### U1 — verify after publish

- Commit: `2b7e8e86f8c310aa6f15da9cff702797a91c4812`
- URL: record a sub-cent token such as PEPE at US$0.00001. Check holdings, review, sell default, and the ledger.
- Expected: the unit price keeps its significant digits. Totals stay NZ$ to 2 decimal places. No "+99900.00%" and no unit price shown as US$0.01.

### U2 — verify after publish

- Commit: `2b7e8e86f8c310aa6f15da9cff702797a91c4812`
- URL: Correct this holding, date 10 Oct 2026, including before 1 pm NZDT.
- Expected: the correction saves. The ledger date is 10 Oct 2026, not "the date can't be in the future".

### U3 — verify after publish

- Commit: `e0ecbc9d39123c249dfa41a57ed18b71c880b75e` (merged from develop while this branch was open)
- URL: `/markets`, Crypto tab, signed in and signed out.
- Expected: top 400 by market cap, a Blockchain column, a DEX top-400 view, "Name" rather than "COMPANY", an Add to paper book action, and no "~90" copy.

### U4 — verify after publish

- Commit: `2b7e8e86f8c310aa6f15da9cff702797a91c4812`
- URL: a public page in a fresh browser.
- Expected: no `googletagmanager` request before Accept. Decline loads no gtag. Cookie settings can change the choice.

### U5 — verify after publish

- Commit: `e0ecbc9d39123c249dfa41a57ed18b71c880b75e`
- URL: `/how-it-works`, `/trust`, Privacy §2, Terms §2.
- Expected: one paper-book statement. Real trades happen at the broker. AetherForge does not move money.

### V1 — verify after publish

- Already merged before this round. Do not redo.
- URL: Add panel, search PEPE and UNI.
- Expected: DEX badge, a live price filled, and no "No price came back".

### V2 — verify after publish

- URL: dashboard holdings row, Edit pencil, stocks table, crypto table.
- Expected: "Correct this holding" opens, and FX shows 4 decimal places.

### V3 — verify after publish

- URL: Transaction ledger.
- Expected: the FX column shows 4 decimal places on non-NZD rows.

## Not this batch

Status for each: **not done** (another batch). This pull request does not change them.

- H5. Settings Plan & billing and Notifications, `/billing`, "Apex Dual".
- H6. Toast and modal email copy, templates behind an off flag, branded sender DNS. No email was sent or enabled here.
- H7. `/nope-404`, `/plans`, and `/bots` should 404 with their own title.
- H8. Strip currency, NZ$ toggle, coin names.
- H9. robots.txt Sitemap line, sitemap lastmod, `/projections`, `/blog`, no Set-Cookie on sitemap.xml.
- H10. `/performance` one name, a historical label, and one 1.98% definition.
- H11. Nav includes How it works, Projections, and Trust.
- M1. Correction row shows quantity and price before and after, with one note.
- M2. DEX badge kept on the sell path.
- M3. Login succeeds on the first quick attempt.
- M4. CPI date is the same everywhere.
- M5. Projection counts match.
- M6. DEX badge on sell (see also V1).
- M7. Koins sweep label. Left as "Biggest share-price gainers…".
- M8. Terms §5/§6, pricing, and how-it-works agree. Bot count and "Analyse ADA with Koins".
- M9. GeckoTerminal in the processor lists. Title separators.
- M10. Dates "10 Oct 2026" and "Sep", no ISO or UTC shown to members.
- M11. NZ$ always 2 decimal places, no negative zero, drift in percentage points.
- M12. A fresh buy shows NZ$0.00 gain. No "US$ …" in pricing HTML.
- M13. Stale quotes flagged on the markets pages (report prints are H2).
- M14. Security headers stay only in `next.config` `headers()`. security.txt.
- M15. An h1 on login and register. No duplicate names for screen readers.
- L6. Onboarding count.
- L7. Review heading.
- L8. Load times outside the Headmaster link (that link is H3).
- L9. CSV: 2 decimal places, 4 decimal FX, no float artefacts, columns filled.
- L10. Lot dates. A merged WOR lot should keep "first bought 1 Oct 2026".
- L11. Validation: "Enter a number", errors clear on change, no cash-after figure before the block.
- L12. Dividends limited to shares and ETFs, or labelled Income, with a date.
- L13. `/tax` summary of dividends and realised P&L, plus the IRD disclaimer.
- L14. `/favicon.ico` and web manifest. `/dex` should not bounce to login.
- L15. Terms host matches the apex domain.
- L16. `/about` image served from a public asset path, not a signed URL that expires in 2098.
- L17. Market News server-renders more than two cards and explains the relevance scores.

## Checks run on this branch

- `vitest run`: 416 tests passed before the develop merge. After merging `e0ecbc9`, the H1/H2/L3/L4 tests and the U3/U5 tests passed.
- `tsc --noEmit --skipLibCheck`: passed.
- `eslint` on the files in this batch: passed.
- `next build`: passed (Next.js 15.3.9).

## Left untouched on purpose

`CRYPTO_PROJECTIONS_PAUSED` remains true. `CRYPTO_SANITY_RATIO` stays 3. Reviewed FX stays ±5%. `preserveDynamicSegmentTraces` is unchanged. Security headers stay in `next.config` `headers()` only. New books still start at NZ$0. The fee default stays NZ$0.00. `auth.ts`, auth mail, transactional mail, and news ingestion were not edited. No email was sent or enabled. Reports describe intelligent AI bots and do not name Grok, ZENITH, or ULTRA. No Totalum AI product name was added. Nothing was published.
