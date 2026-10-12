# Pull check — 12 Oct 2026

Marker: `pull-check:v3-tier1b-2026-10-12`

This file supersedes `qa/PULL-CHECK-2026-10-10.md`. That file is kept, with every section still in it. This round covers H2, H1, T1, T2, T3, T4 and T5. U3, U7, V1 and P1 are another agent's scope. H4, L8, L10, the Low items and S1 are later.

Repo: https://github.com/AetherForge-Ai/aetherforgeai
Branch: `cursor/qa-tier1b-h2-t1-68ab`
Base: `develop` at `add1d4e7f3315871a1916df83c70a4ac283fcf81` (Keep a last-good crypto and DEX list when the live feeds are blocked. #318)
Implementation commit: `1cf96b28aa600e350017d16d4bf6d6365eb0d91e`
Pull-check commit: `13d4e6b5f6ac49198806e918b3853382c9b88f41`

## Checks

- `npx vitest run`: 135 files, 631 tests passed.
- `npm run check-types-errors`: passed.
- `npm run build`: passed (Next.js 15.3.9, compiled and generated 23 static pages).
- Browser: the signed-in Stox report, ledger, holdings and tax screens were not opened in a browser. Those screens need the QA account. The exact strings are asserted in `src/lib/qa-tier1b.test.ts`.

## Written confirmation

- Did not Publish.
- Sent no email.
- Removed or renamed no Stox, Koins or Headmaster list or section. Projected top 10, not-sized lists, pathways, 24 h / 7 d / month sweeps, synthesis, strategy and the Closed-call score box are still present.
- Ran no production data change. The T1 recompute and the T5 backfill were not run. Both scripts refuse `--apply` and do not connect to a database.
- Put no credentials in code, commits, logs, this file or the reply.
- Did not add a database column. Did not change auth, login, register, security headers, consent, the apex domain or `next.config`. Did not change the Confirm save path, the Add panel price prefill, or the crypto / DEX / markets snapshot.
- Reports do not name Grok or an AI model. No GST. No Totalum AI Pull.

## Needs Lukas

- **T1 cost method.** FIFO (first in, first out) is the single method on the ledger, holdings gain, income, the tax page, realised, the CSVs and FIF. Confirm that choice before any stored-row recompute.
- **T1 recompute.** `scripts/recompute-fifo-realised.js` prints `qa/T1-fifo-recompute-dry-run.txt` and was not run against production. `--apply` exits 1 with "Refused. Lukas must confirm FIFO before any recompute. This script does not write." Approve it before any production write. Pages already total FIFO at read time, so the displayed figures agree before that write.
- **T5 backfill.** `scripts/backfill-datetime-nz.js` prints `qa/T5-datetime-backfill-dry-run.txt` and was not run. `--apply` exits 1 with "Refused. Lukas must approve the DateTime_NZ backfill before it runs. This script does not write." Until it runs, rows with no clock show "time not stored" in the Data note.
- Publish, when you choose to. This branch does not publish.
- U3 CoinGecko key and plan, L10/U2 correction-date decision, and the S1 Scorecard budget are not this PR.

## U3 — not done

- Status: not done (another agent: crypto / DEX / markets snapshot)
- Commit: none on this branch
- Files: none
- URL / steps: signed out and signed in, `/markets` Crypto and DEX, compared at the same minute
- Expected:
  - Both show 400 rows (or an honest count with "Prices as at …"), the same first 25, and the same as-at time.
  - Name ≠ Ticker on every row, except a short allowlist of coins whose official CoinGecko name is the symbol (BNB, XRP, USDC). Expected names include "TRON", "Injective", "Celestia", "Algorand", "Stellar", "Bitcoin Cash", "Hedera", "Jito", "Sei", "Ondo".
  - Blockchain is filled on at least 95% of rows. DEX Chain and DEX are 100% filled.
  - 0 duplicate network+address pairs. 0 "Last good" cells. All "US$".
  - URL = visible tab, one pill, "coins" / "DEX tokens". Each tab in 3 s or less.
- Needs Lukas: the CoinGecko key variable and plan

## U7 — not done

- Status: not done (another agent: Koins half of H2)
- Commit: none on this branch
- Files: none
- URL / steps: a Koins report, then a feed-failure test
- Expected:
  - No all-0.00% sweeps, no negative "gainers", no uniform +12.00%/40% movers, no stablecoins or wrapped tokens, and a "prints under review" line on every sweep.
  - In the feed-failure test, every section shows "Crypto market data is unavailable right now, so this list is not ranked. Last good snapshot: <date, time>."
- Needs Lukas: nothing from this branch

## V1 — not done

- Status: not done (another agent: Add panel price prefill)
- Commit: none on this branch
- Files: none
- URL / steps: Add → PEPE and UNI
- Expected: "Today's price is filled in. You can type over it." with a price. The CSV audit has "live=<number>".
- Needs Lukas: nothing from this branch

## H2 — fixed (Stox half)

- Status: fixed
- Commit: `1cf96b28aa600e350017d16d4bf6d6365eb0d91e`
- Files: `src/lib/quote-review.ts`, `src/lib/markets-session.ts`, `src/lib/apex.ts`, `src/lib/report-service.ts`, `src/lib/report-topup.ts`, `src/lib/report-copy.ts`, `src/lib/report-html.ts`, `src/components/bots/ApexReport.tsx`, `src/lib/qa-tier1b.test.ts`
- URL / steps: signed in, `/dashboard`, Report Center, run a full Stox report. Open Full multi-timeframe mover sweep (Last 24 hours, 7 days, month) and "Top gainers identified". Compare each ranked NZX, ASX and US row with the same ticker on `/markets` at that time. Koins is unchanged in this PR.
- Expected:
  - In a new Stox run, every ranked NZX, ASX and US row is within 2pp of the same ticker on /markets at that time.
  - CNU.NZ either matches Markets (for example 0.00%) or appears only as "CNU.NZ — print under review".
  - GXH.NZ, EBO.NZ, TRA.NZ, FLT.AX, AMC.AX and PAYX either match Markets or appear only as "<ticker> — print under review" (em dash, no %).
  - Under-review rows are below the ranked list. They have no rank and no percent. They are not used in "Top gainers identified" and not used for sizing.
  - "Top gainers identified" names only ranked rows.
  - The large-cap guard (about 20%) still withholds those prints.
  - A percent that repeats across 2 or more runs while the price changed is withheld the same way. Rejected rows are logged with both values.
  - All lists are still present.
- Needs Lukas: Publish, when you choose to

## T1 — fixed in display; recompute needs Lukas

- Status: fixed for the displayed totals. The stored-row recompute is not applied.
- Commit: `1cf96b28aa600e350017d16d4bf6d6365eb0d91e`
- Files: `src/lib/lot-day.ts`, `src/lib/fifo-cost.ts`, `src/lib/fifo-cost-server.ts`, `src/lib/tax-realised.ts`, `src/lib/taxable-income.ts`, `src/lib/tax-book-server.ts`, `src/lib/transactions.ts` (ledger read totals only; Confirm save is untouched), `src/lib/transaction-csv.ts`, `src/app/api/stocks/route.ts`, `src/app/api/stocks/refresh/route.ts`, `src/app/api/transactions/export/route.ts`, `src/app/tax/realised/page.tsx`, `src/app/tax/income/page.tsx`, `src/components/tax/TaxPageContent.tsx`, `src/components/dashboard/TransactionCenter.tsx`, `src/components/dashboard/PortfolioDashboard.tsx`, `src/components/totalum/TotalumConsole.tsx`, `src/lib/tax-public-summary.ts`, `scripts/recompute-fifo-realised.js`, `qa/T1-fifo-recompute-dry-run.txt`, `src/lib/qa-tier1b.test.ts`, `src/lib/tax-realised.test.ts`, `src/lib/taxable-income.test.ts`
- URL / steps: signed in, open the ledger (`/dashboard` Transaction Ledger), `/tax/income`, `/tax`, `/tax/realised`, and download the transactions CSV. On `/dashboard/stocks`, read WOR while the price is AU$9.44. Book a new buy and open `/tax/realised`.
- Expected (on the current QA book, after Lukas approves and the recompute runs):
  - "Cost method: FIFO (first in, first out)." once on the ledger, holdings, `/tax`, `/tax/income`, `/tax/realised`, `/tax/fif` and the Headmaster intro.
  - Ledger YTD, /tax/income "Realised", the /tax "Realised profit and loss" line, /tax/realised "Combined realised" and the CSV RealizedPnlNZD sum all show the same value: **-NZ$10.67**.
  - No "rows differ from the amount stored" line.
  - /dashboard/stocks WOR shows a gain of "AU$0.00 0.00%" when the price is AU$9.44, and (price − 9.44) × 1,000 at other prices. The overlay is on the response only. It does not write `purchase_price`.
  - A new buy made today shows on /tax/realised as "Lot 12 Oct 2026". Lot dates come from each buy row's NZ calendar Date (`trade_date`), not the merged first-bought date.
- Dry-run (sample book, not production), already in the PR:

```
FIFO recompute dry-run
Cost method: FIFO (first in, first out).
NOT APPLIED. This script does not write. Lukas must confirm the cost method before any recompute.

Sample book (not production):
- ETH 2026-09-01 stored -NZ$10.59 FIFO -NZ$10.59
- WOR.AX 2026-10-10 stored NZ$0.00 FIFO -NZ$0.04
- WOR.AX 2026-10-11 stored NZ$0.00 FIFO -NZ$0.04
Combined FIFO -NZ$10.67
Rows that would change: 2
```

- Needs Lukas: confirm FIFO, then approve the recompute before it runs. This PR does not run it.

## H1 — fixed

- Status: fixed. The projected-list reason is the rating action and the failing input. MAH.AX (score 40, labelled Reduce, bearish MACD) is "rating TRIM: momentum negative" on the row and on Not sized. A buy signal held only by a bearish MACD is "rating HOLD: momentum negative". "rating data unavailable" is only when signal, MACD, and regime are all missing.
- Commit: `821b4e43ce249e2025910f2250791860591ec7b8` (reason text). List and note: `1cf96b28aa600e350017d16d4bf6d6365eb0d91e`.
- Files: `src/lib/report-copy.ts`, `src/lib/apex.ts`, `src/components/bots/ApexReport.tsx`, `src/lib/report-html.ts`, `src/lib/qa-tier1b.test.ts`
- URL / steps: the same Stox report, "Next 7 days · Top-10 projected movers", then "Not sized this week"
- Expected:
  - The projected list shows this note exactly: "Ranked by projected 7-day move only. A rank is not a buy rating; each name's rating is shown."
  - The MAH.AX row reads like "1. MAH.AX · ASX AU$1.11 +5.56% 65% · Not a buy: rating TRIM: momentum negative".
  - The reason matches the "Not sized" entry ("rating TRIM: momentum negative"). Score 40 is labelled Reduce, so the action is TRIM, and the bearish MACD is the momentum clause. The fixed sentence "the rating is not a buy" is not used. "rating data unavailable" is only when the row has no signal, MACD, or regime.
  - Each row has a rating cell "BUY" / "HOLD" / "Not a buy: <reason>".
  - The list still has 10 rows. Order is still projected 7-day move only.
- Needs Lukas: Publish, when you choose to

## P1 — not done

- Status: not done (another agent: Confirm save path)
- Commit: none on this branch
- Files: none. `applyTransaction` in `src/lib/transactions.ts` was not edited.
- URL / steps: 5 Confirms (WOR buy and sell, PEPE buy and sell, UNI buy), then a double-click, then the first CSV download
- Expected:
  - Each of 5 consecutive Confirms reaches "Transaction recorded" in 3 s or less. The first one takes 5 s or less.
  - Double-clicking Confirm creates exactly 1 ledger row.
  - The first CSV download starts in 3 s or less.
- Needs Lukas: nothing from this branch

## T2 — fixed

- Status: fixed
- Commit: `1cf96b28aa600e350017d16d4bf6d6365eb0d91e`
- Files: `src/lib/lot-day.ts`, `src/app/api/tax/realised/export/route.ts`, `src/app/api/tax/income/export/route.ts`, `src/app/api/tax/dividends/export/route.ts`, `src/lib/tax-realised.ts`, `src/lib/taxable-income.ts`, `src/lib/dividend-ledger.ts`, `src/app/api/transactions/export/route.ts`
- URL / steps: download the three tax CSVs and the transactions CSV. Check the file name and `tail -c1 <file> | xxd`.
- Expected:
  - `realised-pl-2027-YYYY-MM-DD.csv`
  - `taxable-income-2027-YYYY-MM-DD.csv`
  - `dividend-ledger-2027-YYYY-MM-DD.csv`
  - `transactions-YYYY-MM-DD.csv`
  - 2027 is the tax year. The second date is the NZ export date. On an export dated 12 Oct 2026 the names are `realised-pl-2027-2026-10-12.csv`, `taxable-income-2027-2026-10-12.csv` and `dividend-ledger-2027-2026-10-12.csv`.
  - `tail -c1 <file> | xxd` shows `0a` for all 4 files. Exactly one line terminator.
  - On-screen dates stay "12 Oct 2026".
- Needs Lukas: nothing

## T3 — fixed

- Status: fixed
- Commit: `1cf96b28aa600e350017d16d4bf6d6365eb0d91e`
- Files: `src/lib/ledger-schema.ts`, `src/lib/transaction-csv.ts`, `src/app/api/transactions/export/route.ts`, `src/lib/fifo-cost.ts`, `src/lib/qa-m10-l17.test.ts`, `src/lib/qa-tier1b.test.ts`
- Removed headers (in this order of removal; remaining headers stay in their previous order): **SignalPrice**, **NotionalNative**, **Broker**.
- Remaining headers: Date, DateTime_NZ, ExecutionStatus, Type, Ticker, AssetName, AssetType, AssetId, Quantity, FillPrice, FillCurrency, PriceSource, PriceAsAt, MarkPriceAtExport, FeesNative, FeesNZD, NativeNotional, FxRate, FxSource, CashNZD, RealizedPricePnlNZD, RealizedFxPnlNZD, RealizedPnlNZD, OrderSizing, Notes, Venue, Chain, Data note.
- URL / steps: download the transactions CSV. Check that no column is blank on every row. Read Venue, Chain, FxRate and the realised split on sells.
- Expected:
  - No column is blank on every row.
  - Venue is filled on every row: "NZX", "ASX", "NYSE" / "NASDAQ", "CoinGecko", "DEX: <name>", "Cash".
  - **Metals venue is "NZX".** Metals sit on the NZD-spot book, so the CSV labels them NZX. That is the documented choice for this column.
  - Chain is filled on crypto and DEX rows (for example "Ethereum", "Solana"). Stocks may leave Chain blank; the column is filled on crypto rows, so it is not blank on every row.
  - PriceAsAt: quote time on new trades ("11 Oct 2026, 1:30 pm"). Old rows say "not stored".
  - MarkPriceAtExport: the mark when one is stored, otherwise the fill, so the column is not all blank. When the mark is the fill, the Data note says "Mark is the fill, not a live export price." This PR does not rebuild the U3 snapshot.
  - FxRate is "1.0000" on NZD rows.
  - The sell rows have both split values, and price + FX = RealizedPnlNZD to 2dp. The split is the FIFO split from T1.
- Needs Lukas: the T1 cost-method confirmation, because the split uses FIFO

## T4 — fixed

- Status: fixed
- Commit: `1cf96b28aa600e350017d16d4bf6d6365eb0d91e`
- Files: `src/lib/fif-working-paper.ts`, `src/lib/fif-working-paper.test.ts`, `src/app/tax/fif/page.tsx`, `src/lib/tax-public-summary.ts`, `src/lib/lot-day.ts`
- URL / steps: `/tax/fif`, read the WOR.AX cost line and compare it with the ledger cost for the same lots
- Expected:
  - /tax/fif shows "WOR.AX: cost NZ$11,743.36." (with the book unchanged), and it equals the ledger.
  - One money path: sum at full precision and round once to 2dp. Same cost source as T1 (`buyLotDay`). A one-cent booked cash amount does not replace the formula.
  - The Australian listings sentence remains: "A ticker ending in .AX is included in the NZ$50,000 cost total. Australian-exempt companies can be left out by the member when they are on the ASX list Inland Revenue names, are Australian resident and not treated as resident elsewhere under a treaty, maintain a franking account, and the stock is not stapled. This book cannot check those conditions."
- Needs Lukas: the T1 cost-method confirmation (FIF uses the same FIFO lots)

## H4 — not done

- Status: not done (later)
- Commit: none on this branch
- Files: none
- URL / steps: screen-record a WOR ×1 buy, then a sell straight after
- Expected:
  - The header never shows NZ$11.74 holdings or NZ$0.00 crypto or metals. It goes straight from NZ$31,722.42 to NZ$31,734.16 (or the equivalent at current prices).
  - Cash never shows an intermediate value.
  - A sell straight after a buy never shows "You don't hold this asset".
- Needs Lukas: nothing from this branch

## L8 — not done

- Status: not done (later). p50 and p95 were not measured on this branch.
- Commit: none on this branch
- Files: none
- URL / steps: first signed-out visit, signed-in dashboard warm and cold, ledger, Crypto tab
- Expected:
  - First visit, signed out → /login (or the public page) in 5 s or less.
  - Signed-in dashboard values in 3 s or less (warm) and 6 s or less (cold).
  - Ledger values in 3 s or less.
  - Crypto tab in 3 s or less.
- Needs Lukas: nothing from this branch

## T5 — display note shipped; backfill needs Lukas

- Status: partial. The Data note is in place. The backfill script was not run.
- Commit: `1cf96b28aa600e350017d16d4bf6d6365eb0d91e`
- Files: `src/lib/transaction-csv.ts`, `src/lib/lot-day.ts`, `src/lib/fifo-cost.ts`, `scripts/backfill-datetime-nz.js`, `qa/T5-datetime-backfill-dry-run.txt`, `src/lib/qa-tier1b.test.ts`
- URL / steps: transactions CSV, rows from the 8:27–8:40 am run (WOR and UNI round trips, WOR dividend). Read DateTime_NZ and the Data note.
- Expected: Those rows read "11 Oct 2026, 8:3x am", or carry the Data note text. Before the backfill runs, a row whose DateTime_NZ has no time carries "time not stored" in the Data note.
- Dry-run (not applied):

```
DateTime_NZ backfill dry-run
NOT APPLIED. This script does not write. Lukas must approve the backfill before it runs.

- WOR.AX shown "11 Oct 2026" proposed 11 Oct 2026, 8:27 am (would copy createdAt into DateTime_NZ)
- UNI shown "11 Oct 2026" proposed 11 Oct 2026, 8:33 am (would copy createdAt into DateTime_NZ)
- WOR.AX shown "11 Oct 2026" no write (time not stored)
```

The two proposed times come from `2026-10-10T19:27:00.000Z` and `2026-10-10T19:33:00.000Z`.

- Needs Lukas: approve the backfill before it runs

## L10 / U2 — not done

- Status: not done (later; decision needed)
- Commit: none on this branch. The earliest-buy overlay was not changed.
- Files: none
- URL / steps: `/dashboard/stocks` PFI "first bought", and a correction made today in "latest 5"
- Expected: As decided, and stated in the pull-check file. A correction made today shows today's date and appears in "latest 5". QA's view, not implemented here: first bought = the date of the earliest buy row (10 Oct 2026 is consistent), and a correction's ledger Date = the day it was recorded, with the lot date shown in the note.
- Needs Lukas: which date is right

## Low — not done

- Status: not done (later). Each item below is unchanged on this branch.
- Commit: none on this branch
- Files: none

### H8 (folded into U3)

- Expected: no raw-ticker names. Retest under U3.

### H3 copy

- Expected: "Amounts are the NZ$ gap to the target weight."

### Koins HOLD with a size

- Expected: a HOLD shows "No new size: HOLD."

### Report Center flash

- Expected: no 0 / 51 flash on reload.

### M1 note

- Expected: "Note: QA M1 revert 11 Oct" is visible under the ledger row.

### Logout

- Expected: open /logout, navigate away at once, and /dashboard is signed out.

### Old CSV notes

- Expected: new audit notes use significant-digit formatting. Old rows stay unchanged unless Lukas approves.

### /about title

- Expected: "About — Built in New Zealand, for New Zealanders — AetherForge AI".

### 404 og:url

- Optional. No og:url or canonical on the 404 page. Harmless with noindex.

- Needs Lukas: approval before any rewrite of old CSV audit notes

## S1 — not done

- Status: not done (later). Start only after U3, U7, V1, H2, T1, H1 and P1 are merged.
- Commit: none on this branch
- Files: none
- Expected for this round: a design-acknowledgement note and a Phase 1 PR at most (insert-only proven by a failing UPDATE/DELETE test). Nothing scheduled, nothing emailed.
- Needs Lukas: the Scorecard budget (AI cost of one report in NZ$ to 2dp) before any scheduled run

## Reconciliation covered by tests

`src/lib/qa-tier1b.test.ts` checks that, on the sample FIFO book, ledger YTD, income "Realised", the tax-page realised total, /tax/realised "Combined realised" and the CSV RealizedPnlNZD sum are all **-NZ$10.67**.
