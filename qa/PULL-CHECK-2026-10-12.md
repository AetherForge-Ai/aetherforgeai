# Pull check — 12 Oct 2026

This file keeps both note sets after the merge of develop `3d05b6b` (#324).

- U3, U7, V1, and P1: marker `pull-check:v3-tier1a-2026-10-12`
- H2, H1, and T1–T5 from #324: marker `pull-check:v3-tier1b-2026-10-12`
- Keyless crypto and DEX seed: marker `pull-check:v3-crypto-seed-2026-10-12`
- Research retest 8: marker `pull-check:v3-retest8-2026-10-12`
- Testing Technician retest: marker `pull-check:v3-retest-tt-2026-10-12`

`qa/PULL-CHECK-2026-10-10.md` stays, with both supersession lines and every earlier section.

## Testing Technician retest

`pull-check:v3-retest-tt-2026-10-12`

Keyless crypto sends `AetherForgeAI/1.0` and returns as soon as one source has 40 coins. CoinCap is skipped unless `COINCAP_API_KEY` is set. `Powered by CoinGecko` is shown only when CoinGecko supplied a row. `/api/crypto` serves the same snapshot as the markets route. Public and signed-in Crypto read that snapshot, including `Prices as at`. DEX rows need a chain and a DEX. Confirm starts the FX lookups with the live spot and does not cold-seed the snapshot. A 7-day equity move above 30% is under review and leaves the rank. A month with 0 gainers says the list is unavailable. Identical large percents and extreme movers are dropped unless a second source agrees. CSV `RealizedPnlNZD` is the FIFO row total. New crypto rows stamp `chain=` and `pxat=` into notes. Holdings use the last good price when the live print is missing. HOLD has no illustrated size. The about title is `About — Built in New Zealand, for New Zealanders — AetherForge AI`.

This note does not Publish, send email, or add GST. Public copy says AI. Stox, Koins, and Headmaster lists stay. Crypto projections stay paused. `SWYFTX_PUBLIC_DISPLAY` and `DEXSCREENER_PUBLIC_DISPLAY` stay off.

## Keyless crypto seed

`pull-check:v3-crypto-seed-2026-10-12`

Live `/api/crypto/markets` and `/api/crypto/dex` were `ok: false` with 0 rows. Public Crypto showed "Live crypto prices are not shown right now" and DEX showed "Showing 0 of up to 400". `COINGECKO_API_KEY` and `CRON_SECRET` are unset, and `wrangler.jsonc` has no cron.

The #318 snapshot (Workers Cache, temp file, hidden AF-CGS / AF-DXS rows) only stored a list after a complete CoinGecko or GeckoTerminal pull. A page read did not wait for that pull. It started a background refresh, and a short Worker isolate can freeze that work when the response ends. With the free CoinGecko call blocked or rate-limited, nothing was ever written, so there was no last-good list to serve. The earlier 89-coin backup was also refused: `parseCrypto` dropped lists under 100 rows, and a Yahoo list with no market cap could not be stored.

A page request with an empty snapshot now waits on a keyless seed: CoinGecko's public market list, CoinPaprika, CoinCap, and Binance public tickers. Yahoo's mapped majors fill only when those lists are still short of 40. Prices that miss each other by more than 3× are dropped, not averaged. A stablecoin more than 2% from 1.00 is dropped. The stored rows keep their source and the snapshot time. The notice is `Prices as at … (NZ).` plus `Source: …` or `Sources: …`, and `The feed is delayed.` when the snapshot is older than 30 minutes. A later read serves that list. A shorter seed does not replace a longer one. DEX does the same with GeckoTerminal and DexPaprika. DexScreener and Swyftx stay off unless their display flags are on. No new database column. The hidden watchlist rows are still the only snapshot write, and only when the JSON fits.

`/returns` is auth-only and is no longer in `sitemap.xml`.

This note does not Publish, send email, or add GST. Public copy says AI. Stox, Koins, and Headmaster lists stay. Crypto projections stay paused.

## U3, U7, V1, and P1

`pull-check:v3-tier1a-2026-10-12`

This file covers U3, U7, V1, and P1. `qa/PULL-CHECK-2026-10-10.md` stays and is marked superseded. H2, H1, and T1–T5 belong to another agent. H4, L8, L10, the Low items, and S1 belong to a later agent. This PR does not Publish, send email, run a Totalum AI Pull, or add GST.

Repo: https://github.com/AetherForge-Ai/aetherforgeai
Branch: `cursor/qa-u3-u7-v1-p1-04e9`
Base: `develop` at `add1d4e` (Keep a last-good crypto and DEX list when the live feeds are blocked, #318).
Draft PR: https://github.com/AetherForge-Ai/aetherforgeai/pull/323 (not merged). The previous head `a81db072` includes the develop merge `bb5bc39`. Review fixes after that head are on this same branch. This branch now also contains develop `3d05b6b` (#324). Do not merge.

## Confirmations

- Did not Publish.
- Sent no email.
- Removed or renamed no Stox, Koins, or Headmaster list or section.
- Ran no production data change.
- Put no credentials in code, commits, logs, this file, or the reply.
- Public copy says AI. SuperGrok is not added here.
- `SWYFTX_PUBLIC_DISPLAY` and `DEXSCREENER_PUBLIC_DISPLAY` stay off.
- `CRYPTO_PROJECTIONS_PAUSED` stays true.
- No new database column. The idempotency key is request-only and is stamped into the existing notes field.
- Auth, login, register, security headers, consent, apex routing, and `next.config` were not edited.
- `wrangler.jsonc` has no cron trigger.

## Scheduler

This runtime has no cron. `wrangler.jsonc` does not contain a cron trigger, and the product-note route already says no cron is installed. A page read returns the persisted snapshot (Workers Cache, a temp file, and the hidden AF-CGS / AF-DXS watchlist rows from #318 when the JSON fits). An empty snapshot is seeded on that request from the keyless sources in the section above. A stored list is served with its timestamp. If that snapshot is older than 30 minutes, the read also starts one background refresh. A short Worker isolate can freeze that work when the response ends. `GET` or `POST /api/cron/crypto-snapshot` runs the same job to completion when `CRON_SECRET` matches `x-cron-secret` or `Authorization: Bearer`. The compare is `crypto.timingSafeEqual` on equal-length buffers. A different length is 401. A `?key=` or `?secret=` on this route is ignored. If `CRON_SECRET` is unset the route stays closed, refreshes nothing, and sends no email. A shorter seed does not replace a longer stored list. A verified list is still stored when the snapshot is empty, including a list under 100 rows. A crypto list with at least 100 market-cap rows may replace a longer one. A shorter DEX list replaces a longer one only when the new list is complete.

## Needs Lukas

- Set `COINGECKO_API_KEY` on the host if the keyless CoinGecko call is rate-limited. A demo key uses header `x-cg-demo-api-key` on `https://api.coingecko.com`. `COINGECKO_PRO=on` uses `https://pro-api.coingecko.com` and header `x-cg-pro-api-key`. The key is not logged and is not in this repo. The 11 Oct licensing note left the current API terms and any plan price unverified. This PR does not pick a plan or invent a price.
- Set `CRON_SECRET` and call `/api/cron/crypto-snapshot` from a scheduler outside this Worker if the 400-row list must refresh while nobody has the markets page open. This repo cannot install that scheduler.
- `KOINS_FEED_FAILURE=on` is only for a staging check of the unavailable sentence. Leave it unset in production.
- Publish is not done by this PR.
- T1 cost method, and approval of any recompute or backfill script (T1, T5), are not decided here.
- L10/U2 first-bought and correction dates are not decided here.
- S1 Scorecard budget is not decided here.

## U3 — partial

Status: partial. Signed-in and public Crypto and DEX, the Add and Sell search lists, Koins, and the ticker strip read the same persisted snapshot. The signed-in Crypto tab uses that list, and the public page uses the same function, so one is not empty while the other has rows. Names, Blockchain, DEX identity, the US$ formatter, one pill, and the count wording are in the UI. A full 400-row list is stored only after a complete refresh. Until that refresh succeeds, the last good snapshot is what both views show, with the Prices as at label. There is no cron, so the first complete list needs the protected route or a page-triggered refresh that the isolate is allowed to finish.

Commit: `0b1b8a9` (UI and readers). Tests: `5d863ff`.

Files:

- `src/lib/crypto-board.ts`
- `src/lib/crypto-board-store.ts`
- `src/lib/crypto-source.ts`
- `src/lib/crypto-snapshot.ts`
- `src/lib/crypto-market.ts`
- `src/lib/crypto-names.ts`
- `src/components/dashboard/MarketsExplorer.tsx`
- `src/app/api/crypto/markets/route.ts` (unchanged route; `loadTop400Markets` now reads the snapshot)
- `src/app/api/crypto/dex/route.ts`
- `src/lib/public-market-index.ts`
- `src/lib/public-ticker.ts`
- `src/app/api/cron/crypto-snapshot/route.ts`

Verify:

1. Open `/markets?tab=crypto` signed out and signed in in the same minute.
2. Open `/markets?tab=dex` the same way. Switch the pills and check the URL.
3. Compare the first 25 tickers, prices, and the Prices as at line.

Exact expected strings:

- `Showing 1–25 of 400` when the snapshot has 400 rows. A shorter last-good list says `Showing 1–25 of N` with `Prices as at 12 Oct 2026, 4:05 pm (NZ).` and, when older than 30 minutes, `The feed is delayed.`
- Count line: `400 coins` on Crypto and `400 DEX tokens` on DEX, using the real count.
- Names include TRON, Injective, Celestia, Algorand, Stellar, Bitcoin Cash, Hedera, Jito, Sei, Ondo. Name equals ticker only for BNB, XRP, and USDC.
- Blockchain is Bitcoin, Ethereum, Solana, or Cardano for those L1s. A token uses its primary platform, such as Ethereum or BNB Smart Chain. No em dash on BTC, ETH, SOL, ADA, BNB, XRP, USDC once a complete snapshot is stored.
- DEX chain and DEX name on every row. No duplicate network+address. No cell contains `Last good`. Every USD price starts with `US$`.
- URL `?tab=crypto` or `?tab=dex` matches the visible tab. Exactly one pill is highlighted.
- When the feed is down, the last good snapshot still shows. The signed-in Crypto tab is not empty while the public tab has rows.

## U7 — fixed in code

Status: fixed in code. Koins ranks the sweep from the CoinGecko half of the snapshot. The report universe (`liveCryptoUniverse`) also includes the DEX top list from `readSharedDexBoard`, and a failed DEX read leaves the CoinGecko names and every Koins list in place. A window is ranked only when the snapshot is under 60 minutes old and at least 80% of the candidate rows have a real change for that window. Missing changes stay null. Gainers are positive only. Every sweep carries a prints-under-review line, including zero. Stable, wrapped, and staked symbols are excluded. If at least half of the projected movers share one projection and confidence, that list is cleared and the unavailable sentence is shown. A coin with no live 7-day print uses `clamp(base.projected7dPct, -12, 12)`. Crypto projections stay paused. Stox ranking is unchanged.

Commit: `b7f7ed2`. Tests: `5d863ff`.

Files:

- `src/lib/koins-quality.ts`
- `src/lib/koins-market.ts`
- `src/lib/report-service.ts`
- `src/lib/report-html.ts`
- `src/lib/apex.ts`

Verify:

1. Run a Koins report while the snapshot is under 60 minutes old and the moves are populated.
2. On staging only, set `KOINS_FEED_FAILURE=on` and run Koins again. Unset it afterwards.

Exact expected strings:

- `0 prints under review` when every candidate has a change. A missing change uses `1 print under review` or `N prints under review`.
- `Only N coins gained over 7 days.` when fewer than 10 coins gained. The 24-hour and month lines use the same pattern.
- Feed failure, a snapshot older than 60 minutes, or a uniform projection: `Crypto market data is unavailable right now, so this list is not ranked. Last good snapshot: 12 Oct 2026, 4:05 pm.`
- No 0.00% sweep from a missing change, no negative gainer, no USD0, USX, WEETH, BTC.B, EZETH, or CBBTC in the ranked lists.

## V1 — fixed in code

Status: fixed in code. Add, Sell, and Review ask `/api/tickers/quote`. That route reads the snapshot by CoinGecko id or symbol or address, then one GeckoTerminal token price when network and address are present, then the last stored print. The panel does not open Review while a buy or sell price is still empty.

Commit: `9a35ce9` for the quote route. The panel prefill and the Review block are in `dbf4774` with the Confirm changes. Tests: `5d863ff`.

Files:

- `src/app/api/tickers/quote/route.ts`
- `src/components/dashboard/RecordTransactionPanel.tsx`
- `src/lib/crypto-board-store.ts` (`priceFromSnapshot`, `liveDexTokenPrice`)

Verify:

1. Open Add, search PEPE, and wait for the hint.
2. Repeat for UNI.
3. Open Sell on a PEPE or UNI holding.
4. Record one crypto buy and download the transactions CSV. Read the notes.

Exact expected strings:

- `Fetching today's price…` while the quote is in flight.
- `Today's price is filled in. You can type over it.` with a PEPE price that keeps significant digits (about 0.000004) and a UNI price of about 7.5, once the snapshot has those coins.
- `Live price was unavailable. A recent print is filled in (12 Oct 2026, 4:05 pm).` when only a stored print exists.
- When the snapshot has a price, the audit note contains `live=<number>`. When it does not, the note contains `live=n/a`. The fill price is not copied into `live=`.
- The panel does not show `Price must be greater than zero.` Review stays disabled until a price is present or typed.
- `No price came back` is not shown while `/markets` has a price for that token.

## P1 — partial

Status: partial. Confirm no longer calls the live crypto quote or the DEX search before it returns. A non-NZD trade always asks for `historicalNzdPerUnit` on the trade date, inside a 1,200 ms bound, and that rate is passed to `reviewedFxAllowed`. A cold FX snapshot is bounded at 450 ms. A timeout, and an unsourced baseline table, are not booked. With no reviewed rate, the trade-date rate is used, then a live snapshot. If neither is present the write is refused with `Today's exchange rate did not load, and there is no rate for this trade date. Type the NZD rate, or try again.` A reviewed rate that matches today's snapshot and misses the trade-date rate is refused. The route's movement check is not repeated inside the write. The holding mark is updated from the snapshot after the response is free to return. Confirm is disabled while `saving` is true. One Review sends one idempotency key. A second click in the same process waits on the first write. The user note is cut first, then `idem=` is appended, so a 500-character note still ends with the stamp. An audit line with no snapshot price says `live=n/a`.

This is not one SQL transaction. Totalum writes the holding, the cash balance, and the ledger row one call at a time, with the existing rollback if a later call fails. The FIFO lot read still queries up to 5,000 ledger rows and can dominate the wait. The idempotency map lives in one isolate, so two isolates can still each write once. The CSV export was not changed; its speed is the ledger read, and its columns are unchanged.

Commit: `dbf4774`. Follow-up `b86b029` keeps `ratesForBooking(currency, input.fx_rate, fx.ratesToNZD)`. The review fixes (no baseline on timeout, trade-date FX, timing-safe cron header, `live=n/a`, idempotency stamp) are the commit on this branch after `a81db072`. Tests: `5d863ff` and `src/lib/review-defects.test.ts`. Pull-check: `946201d`.

Files:

- `src/lib/transactions.ts`
- `src/lib/reviewed-book.ts`
- `src/lib/confirm-once.ts`
- `src/lib/cron-header-secret.ts`
- `src/app/api/cron/crypto-snapshot/route.ts`
- `src/lib/trade-schema.ts`
- `src/app/api/transactions/route.ts`
- `src/components/dashboard/RecordTransactionPanel.tsx`
- `src/lib/review-defects.test.ts`

Verify:

1. Record WOR buy, WOR sell, PEPE buy, PEPE sell, and UNI buy. Time the toast `Transaction recorded`.
2. Double-click Confirm on one Review and count ledger rows.
3. Download the transactions CSV and note when the download starts.
4. Read the server log for `[transactions] step`.

Exact expected strings:

- Toast: `Transaction recorded`.
- Button while saving: `Saving…`, and the button is disabled.
- Log lines: `[transactions] step movement-check`, `live-spot`, `fx-snapshot`, `historical-fx`, `fifo-lots`, and `revalue`.
- Notes contain `idem=<key>` at the end, including when the member note was already 500 characters.
- Notes contain `live=<number>` when a snapshot price exists, and `live=n/a` when it does not.
- Target: each Confirm reaches the toast in 3 s or less, the first in 5 s or less, and the first CSV starts in 3 s or less. The FIFO read and Totalum latency can still miss that target. This PR does not claim those times were measured against production Totalum.

## Not in this PR

### H2 — not done

Another agent owns the Stox half. This PR does not change stock ranking.

### T1 — not done

Another agent owns FIFO versus average cost. This PR does not change the FIFO maths and does not recompute stored realised amounts. Needs Lukas: confirm the cost method, and approve any recompute script before it runs.

### H1 — not done

Another agent owns the MAH.AX projected-mover note.

### T2 — not done

Another agent owns tax CSV filenames and trailing newlines.

### T3 — not done

Another agent owns blank CSV columns. This PR does not change the CSV schema.

### T4 — not done

Another agent owns the FIF cost difference.

### H4 — not done

A later agent owns the header flash and the sell-form lag.

### L8 — not done

A later agent owns the slow-load measurements.

### T5 — not done

Another agent owns the 8:3x am rows that have no time of day. Needs Lukas before any backfill runs.

### L10 / U2 — not done

Needs Lukas. QA's view, not implemented here: first bought is the earliest buy row, and a correction's ledger date is the day it was recorded.

### Low — not done

A later agent owns H3 copy, Koins HOLD with a size, the Report Center 0 / 51 flash, the M1 note in the ledger UI, early-leave logout, old CSV note precision, the /about title, and the optional 404 og:url. H8 is folded into U3 and is covered by the name allowlist above.

### S1 — not done

Queued until U3, U7, V1, H2, T1, H1, and P1 are merged. Needs Lukas's budget before any scheduled Scorecard run. This PR does not add the scorecard.

## Tests in this change

`src/lib/qa-v3-tier1a.test.ts` checks the Prices as at sentence, the name allowlist, native chains, DEX dedupe, the Koins unavailable sentence, positive-only gainers, `0 prints under review`, and one Confirm per idempotency key.

## H2, H1, and T1–T5 (#324)

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

## Research retest 8

`pull-check:v3-retest8-2026-10-12`

The live retest ran on a build older than develop. Develop already had Tier 1A #323 and Tier 1B #324. This section records what that develop tree already did, and what this branch changes. Nothing here Publishes, sends email, or adds GST. Public copy says AI.

### Already on develop

1. Sharesies detection. `docs/import-formats-2026-10-12.md` names `Instrument code`, `Instrument name`, or `Company` plus `Type`. `detectBroker` in `src/lib/broker-import.ts` uses those headers. `src/lib/fixtures/broker-import/sharesies.csv` and `sharesies-name.csv` plan as `sharesies`. The live build that said `generic` did not have this detector.
2. Generic column map. A readable CSV that is not Sharesies, Hatch, or IBKR sets `needsMapping`. `BrokerImportPanel` shows "Match the columns" and sends the chosen headers on the next review. `readable-generic.csv` is the fixture.

### Fixed on this branch

3. The paper-deposit checkbox starts off and stays at the choice the member made when a file is chosen.
4. The review shows each exchange rate to 4 decimal places and the source label (`Rate from the file`, `Reviewed rate for the trade date`, or `NZD`).
5. The review counts fills already on the book with the same keys the save uses.
6. Annualised XIRR is withheld when the span is under 90 days. The figure shown is the return over that period. Time-weighted return is shown, or the sentence that says the earlier book value was not stored. The source line does not end in `price..`. Dates on that line use the form `12 Oct 2026`.
7. `/tax` receives `dividendsGrossNzd` from the dividend notes. A row with gross 0.45 and withholding 0.07 says `Gross dividend, before withholding: NZ$0.45.`
8. `/tax/income-summary` redirects to `/tax/income`.
9. Currency effect uses the cost-weighted exchange rate stored on the remaining buy lots.
10. Ledger sell rows show the FIFO read for that row. A stored zero is not left on the screen when FIFO has a figure. The sample 100 shares bought at 1.00 and sold at 1.5608 reads NZ$56.08 on the row and in the card.
11. A backdated import still rematches earlier sells under FIFO. The review names each earlier sell whose realised figure would change.
12. After a save, the import form resets and the button leaves the saving state. A request that does not answer within 30 seconds shows an error and stops waiting.

Verify: `npx vitest run src/lib/retest8.test.ts src/lib/broker-import.test.ts src/lib/performance-math.test.ts src/lib/returns-split.test.ts src/lib/batch2-fixes.test.ts`.

## Research retest 9

`pull-check:v3-retest9-2026-10-12`

Build `v3-retest9-2026-10-12` on develop `b4d0007`. Public copy says AI. Nothing here Publishes, sends email, or adds GST. Crypto projections stay paused. No new database columns.

1. The freephone `0800 238 437` is removed from the footer, contact, About, Terms and schema. The Privacy Commissioner number on the privacy policy stays.
2. The home ticker crypto band reads the shared snapshot, including a price whose 24-hour move was stored as `change24h`.
3. `/api/crypto` and `/api/crypto/markets` fill empty market cap, FDV, volume, 1-hour change, high, low, supply and ATH from CoinGecko markets and CoinPaprika tickers. A missing figure is null, which the screen shows as an em dash. A real zero is not written for those size fields.
4. BTC and ETH detail pages overlay the snapshot, including 7-day change and max supply.
5. A missing live price is the phrase `live: n/a` on the audit note, the audit log, the buy dialog and a ledger row.
6. Sharesies detection normalises a BOM, quotes, case and spaces, and accepts Trade date, Instrument code, Market code, Transaction type, Transaction fee and Order ID.
7. A preview with `needsMapping` returns before the ledger read, and the column map renders.
8. Currency effect for a lot with a stored buy rate is (FX at valuation − FX at buy) × foreign value. Other is rounding.
9. The ledger pages five rows at a time and has Show all.
10. The Koins page reads snapshot prices. Stox reports and the Stox page show the under-review notice and the MAH.AX reason `rating TRIM: momentum negative`.

Testing Technician retest of the same build, on this branch:

11. Public HTML, the hydrated page, the signed-in list, the ticker and Koins read one snapshot. The largest saved list is kept. Blockchain is filled for the top coins, including USDT, WBTC and STETH on Ethereum, HYPE on Hyperliquid and ZEC on Zcash. RENDER is Render and DYDX is dYdX.
12. A DEX snapshot older than about 10 minutes refreshes inside the request, bounded, so the delayed line can clear.
13. Confirm overlaps the movement check, the book read and the cash write with the ledger row. The header cash snaps to the ledger sum and ignores a read that does not yet contain the new row.
14. A buy audit includes `chain=` and `pxat=`. `live=` uses the snapshot price when the form says the price came from the snapshot. A buy with no snapshot origin still says `live: n/a`.
15. List routes serve the saved snapshot and do not seed when one exists. The dashboard loads the transaction book beside names and live marks.
16. The ledger label and the CSV use the same 5000-row query. The page shows a range, or every row.

## Research retest 10

`pull-check:v3-retest10-2026-10-13`

Build `v3-retest10-2026-10-13`. Live retest 10 ran on `v3-retest9-2026-10-12` (develop `21379513`). Nothing here Publishes, sends email, or adds GST. Public copy says AI. Crypto projections stay paused. `SWYFTX_PUBLIC_DISPLAY` and `DEXSCREENER_PUBLIC_DISPLAY` stay off. No new database columns.

1. `/api/crypto/markets` was serving a stored 89-row Yahoo snapshot. The keyless refresh was detached, so the isolate dropped it before it could replace that list. The markets and detail reads now wait, bounded, for a richer seed. A list of at least 100 priced rows with market cap replaces Yahoo. A shorter list does not. Each source records status and a plain reason. A CoinGecko 401, 403 or 1020 says `refused this datacentre IP; Lukas can set COINGECKO_API_KEY`. That reason is on `GET /api/admin/crypto-diagnostics` with the last seed report and live probes for CoinPaprika and Binance. From this checkout's network the keyless hosts answered; the worker egress is only known after that diagnostics call.
2. Yahoo detail fills 1h from the 5-minute chart and 30d from the one-month chart, and keeps the 7-day move. Max supply, FDV and the other size fields come from the richer snapshot or the stat donors. They stay blank when those hosts refuse the runtime.
3. The ledger row shows the audit live figure on its own line (`live: n/a` or `live: <number>`), `data-testid="ledger-live"`.
4. Currency effect on a typical open lot: 100 shares, mark 10 USD, quantity-weighted buy FX 1.60, valuation FX 1.65. Foreign value is 1,000. Currency effect is 1,000 × 0.05 = NZ$50. A closed lot is not in that sum. Research's ~55 against the live NZ$40.05 matches this rule when realised FX sits in Realised. The card says `Currency effect counts open lots only; realised FX is in Realised.`
5. Public `/koins` on the live build already printed snapshot prices (BTC US$82,499.96 and the other majors). This branch does not remove that read.
6. Public `/stox` on the live build already printed `Under review` and `MAH.AX reason: rating TRIM: momentum negative`. This branch does not remove that notice.
7. The ticker no longer aborts its own feed at 8 seconds, and an abort is not logged. `/api/stocks` POST 400 was the holdings cell `APPL / APPLE INC` failing the 12-character ticker check. The stocks button now opens `/import` instead of posting that cell.
8. Stocks `Import CSV` stores the file and opens the import review (preview, duplicates, skipped-row acknowledgement). `APPL / APPLE INC` and `AAPL / APPLE INC` both resolve to AAPL. A holdings file with no side column is treated as buys. A missing date stays a skipped row and blocks save until it is acknowledged. No exchange rate is guessed.
9. DEX rows without a detail id are left out of the saved list and the public list. Wrapped symbols such as WETH and PEPE get a detail id. A short or DexPaprika-only list is refreshed inside the request so GeckoTerminal can replace it with the larger list.
10. Tape rows and the tape's crypto provider use the snapshot source. A Yahoo snapshot says Yahoo Finance, not CoinGecko.

## Testing Technician r3

Same branch. Build stays `v3-retest10-2026-10-13`. No new database columns. No production writes.

1. The durable copy is the hidden watchlist row. A read waits 2.5 seconds for that row when the colo cache and the temp file are empty, and it returns whichever copy has rows. Equal timestamps keep the copy with more rows. The list is compact arrays, split across AF-CGS-1..N and AF-DXS-1..N when one name field is not enough, and the row count is stamped. A truncated prefix is not stored.
2. Signed-in markets and the public page both read that stored list first. Blockchain is filled for WSTETH, USDS, XMR, WBT, LEO, CBBTC and RAIN. The notice, including `Source:`, is the same line the public page and the signed-in table use.
3. DEX no longer labels a DexPaprika list as GeckoTerminal. The public DEX source is the snapshot's own source.
4. Public crypto and DEX `asOf` text is the snapshot notice, so `Source:` is in the server render.
5. A confirm reads the snapshot without the 7-second seed. The independent reads still share one wait. The ledger row is inserted before cash is updated, and a failed cash write deletes that row. A second live-price fetch after that read is not made. A Yahoo-only or short stored list (under 300) waits up to 8 seconds for a richer seed. A longer list refreshes in the background. The ticker fetch times out at 8 seconds, and an abort is not logged as a feed failure.
6. Header holdings and net worth snap together. Net worth is the sum of the rounded cash and the rounded holdings from that same render. The same holding id is counted once. When the ledger quantity is known, an aggregate row beside lots that already sum to that quantity is dropped, and a position read twice at that quantity is counted once. Lots of 10 and 10, and lots of 5, 3 and 2, stay.
7. `idem=`, `live=`, `chain=`, `pxat=` and the `FILLED … source=` audit sentence are kept. Only the user's free text is trimmed, inside 4000 characters.
8. The ledger values one FIFO walk and one open-lot walk per book array. Equity quotes share one in-flight fetch and the one-minute quote cache, including the Yahoo path.
9. A name under review on any window leaves the 24-hour, 7-day and month lists. A non-large-cap 7-day move above 15% is under review. Large-cap week moves stay on the 35% guard, so JPM at 31.01% stays ranked.
10. `Top gainers identified` is taken from that filtered 24-hour list. The forward projection no longer clamps to ±45.
11. RENDER and DYDX are Render and dYdX on the markets body. Net worth adds the already-rounded parts, so it matches cash plus holdings to the cent.

pull-check:v3-dash1-2026-10-13

pull-check:v3-retest11-2026-10-13

pull-check:v3-retest12-2026-10-13

pull-check:v3-retest13-2026-10-13

pull-check:v3-dash-phase1-2026-10-13

Retest 14 / TT r7 (#356): marker `pull-check:v3-retest14-2026-10-13`

Retest 15 / synthetic-data removal (#357): marker `pull-check:v3-retest15-2026-10-13`

Dashboard phase 2 (PR4+PR5, #361): marker `pull-check:v3-dash-phase2-2026-10-13`

Retest 16 / QA r8 (#364): marker `pull-check:v3-retest16-2026-10-13`

Audit 14 batches A-D + D1 (#366): marker `pull-check:v3-audit14-2026-10-14`

Audit 14b — Market Assistant removed from profile menu (#368): marker `pull-check:v3-audit14b-2026-10-14`

Dashboard phase 3 — critique fixes (#370): marker `pull-check:v3-dash-phase3-2026-10-14`

Dashboard phase 4 — retest fixes: marker `pull-check:v3-dash-phase4-2026-10-14`

r11 — site-wide retest fixes (#374): marker `pull-check:v3-r11-2026-10-14`

TT fresh audit 2026-10-14 fixes (U1–U5, H1–H11, M1–M16, LOW): marker `pull-check:v3-tt-fresh-2026-10-15`
TT fresh2 follow-up (review, leftovers, dashboard right column D1–D10): marker `pull-check:v3-tt-fresh2-2026-10-15`
TT fresh3 signed-out /dashboard copy: marker `pull-check:v3-tt-fresh3-2026-10-15`
Merged must-fix batch 1 (CR-1 to CR-6): marker `pull-check:v3-must-fix-b1-2026-10-16`
Must-fix batch 2 (High H-1..H-15): marker `pull-check:v3-must-fix-b2-2026-10-16`
Must-fix batch 3 (Medium, Low, BL, B2 partials): marker `pull-check:v3-must-fix-b3-2026-10-16`
Batch 4 must-fix: BL-7 M-8 M-6 M-7 H-1 M-5 M-2 H-4/M-1/M-10 CR-5 M-11: marker `pull-check:v3-must-fix-b4-2026-10-16`
Must-fix batch 5 (TT b4 retest: CR-2 CR-4 CR-5 M-1 M-3 M-4 M-5 M-11 H-13): marker `pull-check:v3-must-fix-b5-2026-10-17`
Must-fix batch 6 (TT b5 retest: CR-2 CR-5 H-1 H-2 H-4 H-5 H-6 H-7 H-11 H-13 M-3 M-6): marker `pull-check:v3-must-fix-b6-2026-10-17`
Must-fix batch 7 (TT b6 retest: CR-2 CR-5 H-5 H-13 M-3 M-6): marker `pull-check:v3-must-fix-b7-2026-10-17`
- Goal loop batch b8 (GOAL-LOCK CR-2 CR-5 H-5 CR-6 CR-1 H-13 H-10 H-9 M-6 M-3 G-01 G-02): marker `pull-check:v3-goal-b8-2026-10-17`
- Goal loop batch b9 (GOAL-LOCK G-07 G-08 G-09, b8 gaps H-9 split entry + DRP holding count): marker `pull-check:v3-goal-b9-2026-10-18`
- Goal loop batch b10 (GOAL-LOCK G-04 G-05 G-06 G-10 G-12 G-13 G-16): marker `pull-check:v3-goal-b10-2026-10-18`
- Goal loop batch b11 (CR-1 checkout auth + test mode, CR-2/CR-5 IPv6 /64 + per-email, CR-6 dryRun, H-13 allow-list, G-10 G-11 G-14 G-15 G-17, local signed-in harness): marker `pull-check:v3-goal-b11-2026-10-18`
- Goal loop batch b12 (M-1 measure, M-2 docs screenshots, M-6 holdings fit, G-01 aggregates + yield, G-02 Performance panel, Starter cap wording, H-5 date fallback, avatar label): marker `pull-check:v3-goal-b12-2026-10-18`
- pull-check:v3-goal-b13-2026-10-18 — b13: CR-2 backends header, G-10 optimistic delete/snapshot, M-6 actions menu, H-4 server quota, H-12 HOLD/directives, G-02 snapshot deposit, G-17 DEX gate/dedupe/stale crypto.
- Goal b14 (G-10 ledger line + cache, H-4 server quota strip, crypto attempt log, M-2, CR-2 table codes, G-01, H-12): marker `pull-check:v3-goal-b14-2026-10-18`
- Goal b15 (G-02 "Book started" periods, G-01 fee basis on yield, H-12 backtest method on /methodology, M-6 cash actions + full name ≥1440): marker `pull-check:v3-goal-b15-2026-10-18`
- Goal b16 (M-10 shell-only service worker + installable manifest, G-02 stored NZX 50 / S&P 500 NZ$ history and period benchmarks, G-01 31 Mar/1 Apr test, fixture seeding script): marker `pull-check:v3-goal-b16-2026-10-18`
- Goal b17 (G-03 in-app Monday Briefing behind IN_APP_BRIEFS, G-04 in-app Alerts v1 behind IN_APP_ALERTS_V1; K-05/K-12 parked): marker `pull-check:v3-goal-b17-2026-10-18`
- Goal b18 (G-10 optimistic deletes/no list clear, CR-2 schema probe, crypto shared attempt + 5-min single flight, G-02 asOf alignment, M-1 lazy dialog/coach, H-4 500-row example route, CR-6 dry-run button): marker `pull-check:v3-goal-b18-2026-10-18`
- Goal b19 (M-1 lazy ticker/toaster, G-10 browser check, CR-6 UI cap message via dry run, G-29 Xero CSV, G-28 30-day checklist + plan quiz, G-21 whole-wealth page, G-24 paste-text import with AI off, G-20 hashed track-record collection): marker `pull-check:v3-goal-b19-2026-10-18`
- Goal b20 (G-10 authoritative writes + delete confirm + Save anyway override, G-24 per-line fee/ref + review oversell + 20 samples, G-29 Xero on /tax + mobile menu, SECURITY test-hooks 404 + allow-list, G-23 /learn + 3 compare pages, G-20 later prices, CR-2 table error detail + headers-only cron secret, CR-6 assumeHoldings + Free fixture, H-13 ASX tag): marker `pull-check:v3-goal-b20-2026-10-18`
- Goal b21 (M-3 Stox mascot outline/alpha fix, H-4 server quota on the 500-row page, G-08 spot rounding + card title, G-23 nine more sourced guides): marker `pull-check:v3-goal-b21-2026-10-18`
- Goal b22 (M-3 Koins/Headmaster matte, G-23 to 30 URLs, G-05 in-request crypto refresh + recorded attempts, H-10 local import harness, G-02 side-by-side dates, G-20 test-account scorecard, G-28 funnel readout): marker `pull-check:v3-goal-b22-2026-10-18`
- Goal b23 (H-10 CommSec/Hatch fixtures + frankfurter host, G-01 dividend harness, G-02 spreadsheet golden + empty/one-trade, wealth goal debounce): marker `pull-check:v3-goal-b23-2026-10-18`
- Goal b24 HOTFIX + SECURITY (exact pins next 15.5.28, eslint-config-next 15.5.28, @opennextjs/cloudflare 1.20.12, wrangler 4.151.0; no committed fixture password; hooks by user id only; track-record totals only; G-05 list refresh on /api/crypto/markets; compare sources, no GST): marker `pull-check:v3-goal-b24-2026-10-18`
- Goal b25 (CR-2 sliding 60 s window on the durable table, decided-by=durable; xAI guide model configurable via XAI_MODEL with docs-checked default and a 404 fallback, /status probes the chat endpoint and shows model+endpoint; G-10 single-apply delete and bounded spot check): marker `pull-check:v3-goal-b25-2026-10-18`
- Goal b26 (G-10 holding in buy response + session cash reuse; H-4 quota retry/5 s session check/fetch timeouts; track-record 10 s bound + cache + hash how-to; H-13 RBNZ NZ macro; H-15 /trust news sources; deposit removal; seed known book; L-4 assistant counter, Pro upgrade hidden, alerts/Stox in place, vs-price-paid only when held; H-9 one tax pack + PDF wrap/pages + FX source/date; H-11 /dashboard/goals): marker `pull-check:v3-goal-b26-2026-10-18`
- Goal b27 (H-4 session store 503 + get-session cookie guard, Report Center count; G-10 no cached cash after reload, withdraw delete, dialog title; CR-2 xAI error body logged + signed-in share-pick refusal; H-11 contribution validation, monthly amount needed (illustrative), reload after save; H-9 FIF threshold config): marker `pull-check:v3-goal-b27-2026-10-19`
- Goal b28 (#442 G-20 stored scorecard in the ownerless AF-TRS slot, totals only; H-4 member document: 503/timeout → still-signed-in notice, null rechecked once, never the guest gate; G-10 no cross-request server book cache, read-after-write ledger reconcile (no deleted row back, never 0 rows), fill text "Correct the fill price or quantity"; CR-2 refusal + disclaimer on /api/portfolio-coach (the panel's real route) before any fallback, no model call; L-4 shared Assistant quota counted on every answer incl. refusals, used+1 returned, Price alerts counter (no limit); H-11 inputs as JSON in label, plain date, "1 Jan 2031", no NaN, edit pre-filled; H-9 threshold text from FIF_THRESHOLD_NZD, other values labelled jointly held, peak FIFO cost + date; G-05 attempt in durable AF-CAT row): marker `pull-check:v3-goal-b28-2026-10-19`
- Goal b29 (H-4 per-isolate session cache + last-good row for the same signed token on a store timeout, session decision log, honest "could not reach the sign-in service" notice with Sign in again, nav keeps the last confirmed user on an outage; book cache 15 s per user again with the af_bw write stamp (middleware) so a browser that wrote never gets a pre-write book; H-15 news source allow-list shared by /api/news, /market-news and /trust (Proactive Investors listed, unlisted hosts dropped), H-13 NZ/AU filter at the API; G-20 self-seeding stored scorecard (waitUntil), live fallback 5 s; H-1 snapshot memory rechecked every 30 s and only moves forward, compare-and-set on as-of, primary source kept while fresh, coin page large price = header snapshot price, x-af-snapshot-at; G-17 cross-provider id map for bitcoin-cash, near-protocol, rain-protocol, stellar, tron, zcash, tether; L-4 alert counter on /dashboard/alerts and Plan usage, trim note once; G-10 optimistic delete; H-11 monthly > 0 inline error, range rates 2%/5%/8%; H-9 per-portfolio FIF threshold (hidden AF-FIFT watchlist row, no new column), peak FIFO cost line, ZIP pack; G-29 Xero CSV in More/mobile menus; H-12 "Results not published yet"): marker `pull-check:v3-goal-b29-2026-10-19`
- Goal b30 (CR-2 verified facts generated from plans.ts (Free NZ$0, Starter NZ$16/mo NZ$160/yr, Pro NZ$49/mo NZ$490/yr, Ultimate from NZ$199/mo Talk to us, all prices in NZD), paper-book facts, corrected FIF total-cost rule NZ$50,000 / NZ$100,000 jointly held (indicative), no broker recommendations, referral links or user counts, no broker named for "which broker should I use?", import help may name Sharesies/Hatch/IBKR files, fixed disclaimer "General information, not financial advice." on every Assistant reply, NZ$/US$ only; H-1 versioned shared snapshot (ver/at/src on the durable row, compare-and-set, 3 s local copy, chunks before header, torn reads refused, fallback replaces primary only after 10 min, x-af-snapshot-at/x-af-snapshot-version on /api/crypto/markets and /api/ticker, meta tags on /markets and coin pages); atomic per-email login counter (increment first, Cache API deny-only, durable ordinal); G-17 whitebit/leo-token ids; H-15 CRYPTO_PRICE_PROVIDERS drives /trust (CoinPaprika listed); G-10 durable per-user book version (AF-BV hidden row), delete keeps the list during the in-flight read; H-4 report list prefetched with the book; H-9 exempt ASX shares excluded from the FIF cost with dividends as overseas income, overseas fixture seed hook (allow-listed, env password); G-05 PR #447 folded in): marker `pull-check:v3-goal-b30-2026-10-19`
- Goal b31 (H-10 broker CSV import from #449 rebased on b30: Sharesies, Hatch, IBKR, Stake, CommSec, ASB Securities and Jarden contract-note columns (labelled as built from their published contract-note fields, no published header row), Swyftx, Easy Crypto, generic map; 5 MB cap; file and row-level duplicates (broker ref, or ticker/side/units/price/day); undo by batch; writes through applyTransaction so the b30 book-version bump and cache invalidation run; commit/undo rate-limited per member; formula characters stripped from file text; cash total summed in cents; no Math.random. G-10 optimistic paint on Confirm with the dialog held open until the server answers; a refusal rolls back): marker `pull-check:v3-goal-b31-2026-10-19 · pull-check:v3-goal-b32-2026-10-19 · pull-check:v3-goal-b33-2026-10-19 · pull-check:v3-goal-b34-2026-10-19 · pull-check:v3-goal-b35-2026-10-19 · pull-check:v3-goal-b36-2026-10-19 · pull-check:v3-goal-b51a-2026-10-20`
- Goal b52 (Batch 2: G-31 IR3 helper, IR3 2026 Box 17B/17A per IR461 April 2026, with the IR461 quick-sale adjustment shown as its own line in FDR, labelled "Indicative, not tax advice"; BS-02 InvestNow .xlsx and saved-CSV import via the generic column mapper, real layout unverified; BS-01 cron fallback restored as .github/workflows/cron-fallback.yml): marker `pull-check:v3-goal-b52-2026-10-20`
- Goal b53 (BS-01/G-20: cron-fallback runs at 7,37 past each hour so a dropped slot is covered; /api/cron/track-record has a slot-time idempotency key (UTC date + 6-hour block), so a duplicate slot run is a no-op. BS-02: the InvestNow label reads "Beta, layout not yet verified against a real export" until BS-02-VERIFY): marker `pull-check:v3-goal-b53-2026-10-21`
- Goal b53a (build: Totalum Cloudflare build of b53 OOM-killed at "Checking validity of types"; next.config typescript.ignoreBuildErrors, CI tsc still gates every PR; fonts already local via next/font/local): marker `pull-check:v3-goal-b53a-2026-10-21`
- Goal b53b (BS-01/G-20 P1: slot-aware cron watchdog; a missed 16:07 UTC broker-sync or :23 track-record slot is dispatched 45+ min after the slot and within 1 hour; fallback at :10/:40/:55): marker `pull-check:v3-goal-b62-2026-10-23`
- Goal b56 (Batch R, M-2 from #529: help shows admin@ as text, docs guides, /status last OK time per feed in NZ time with equity quotedAt fallback, changelog without commit hashes; REG-1 rides on b55): marker `pull-check:v3-goal-b56-2026-10-22`
- Goal b57 (Batch 3: H-1 keeps the last good crypto list with short refreshes marked delayed; P3 changelog entries for 20–22 Oct; G-01 dividend fixture unit test; carries the BS-01/G-20 Cloudflare Worker cron trigger files from #530): marker `pull-check:v3-goal-b57-2026-10-22`
- Goal b58 (H-9 split keeps cash unchanged (#538); FX P2 daily rate refetched once the provider's next update is due; P3 crypto notice NZDT/NZST and CoinGecko + CoinPaprika credit): marker `pull-check:v3-goal-b58-2026-10-22`
- Goal b59 (H-9b: /api/transactions cash is the same NZD ledger replay as the snapshot when the book holds its opening balance, and a drifted stored balance is healed; H-9c: split correction rows restate earlier lots in the snapshot position build): marker `pull-check:v3-goal-b59-2026-10-22`
- Goal b60 (date-only values are Auckland civil dates in tax/performance readers, so 1 Apr stored as noon NZDT (03-31T23:00Z) stays in the new tax year; split route stores a date-only executed_at; /ledger one 308 to the Transactions tab; /markets metadata snapshot read bounded to 400 ms): marker `pull-check:v3-goal-b62-2026-10-23`
- Goal b61 (TT b60 P2: /ledger and /transactions answer with exactly one 308 straight to /dashboard?tab=transactions from both middleware and next.config redirects; the old 307 alias to /dashboard/transactions is gone): marker `pull-check:v3-goal-b61-2026-10-22`
- Goal b62 (GSC-404: /own-the-bots(/*), /security.txt, /manifest.webmanifest, /manifest.json one 308 from middleware and next.config, /llms.txt added, changelog links straight to the Transactions tab; TT P2: last good DEX list shown marked delayed for up to 24 h instead of "Prices paused", DEX isolates re-read the stored list, /status DEX tokens row, market-snapshot workflow calls /api/cron/crypto-snapshot every 15 min; TT P3: crypto tab always shows "Showing N of up to 400" from the whole list): marker `pull-check:v3-goal-b62-2026-10-23`
- Goal b63 (/status "AI guide" line names no model; POST /api/metals insufficient cash is 422 with code insufficient_cash, not 500; /markets cold path shares one crypto snapshot read started alongside the build; CoinGecko pull retries each page and keeps the last good full list so it does not shrink below 400; crypto header count uses the same full-list number as "Showing N of up to 400"): marker `pull-check:v3-goal-b63-2026-10-24`
- Goal b64 (CR-6/CR-1: Stripe test-mode harness drives the signed webhook route — Starter → 25 holdings, cancel keeps plan to period end then Free, replay and stale replay change nothing, test-mode objects re-read with the test key only, test-mode metadata plans only for allow-listed test accounts in production; products ≤ 6 ids, NZ$16 Starter; M-2: docs 6+ guides with screenshots + link check test; M-7: one text-green token text-gain (--text-green), #059669 text/buttons gone, faint placeholders darker; BS-01: /api/test-hooks/ibkr-sandbox connect/sync/disconnect for GOAL_TEST_HOOK_USER_IDS only, 404 otherwise, never calls IBKR): marker `pull-check:v3-goal-b64-2026-10-24`
- b64 steer: DEX per-page retry/backoff + per-source /status reason, /markets SWR memo, crypto footer "Showing 1–25 of 400" (src/lib/must-fix/b64-steer.test.ts) // pull-check:v3-goal-b64-2026-10-24
- Goal b65 = Batch S2 (G-07: holding caps grid + no-card trial + refund text behind HOLDING_CAPS_V2, OFF in prod, prices unchanged; G-14: shared Add-panel focus trap + keyboard-focusable table regions on dashboard and tax; G-22: planner what-ifs, ranges, NZ Super household, NZ tax unit tests, qa/schema/g22-goal-plan.json; G-24: member AI-off switch, default OFF) (src/lib/must-fix/goal-b65.test.ts): marker `pull-check:v3-g10-b73-2026-10-28`
- Goal b66 = Batch S3 (G-27 read-only share: GET list, /api/share/[id] read view with writes 403/unshared 404, owner-deleted = no access, /settings/sharing, /share/accept, /shared, flag PORTFOLIO_SHARING; G-28 client posts to the write-only funnel route, consent-gated anon cookie, owner-only /api/admin/onboarding-funnel; G-29 Xero CSV text/amount hardening) + TT b64 P3s (DEX per-source report saved on the DEX snapshot and read by /status; signed-out /markets s-maxage=30 stale-while-revalidate=120 in middleware) (src/lib/must-fix/goal-b66.test.ts): marker `pull-check:v3-g10-b73-2026-10-28`
- Goal b68 (G-24: 20 synthetic multi-row paste samples in qa/g24-b68/samples.json, 31/31 rows right, "200 XRP" no longer read as RP, nothing saved before review; G-07: dashboard holdings caps meter (ok / near 80% / full) behind HOLDING_CAPS_V2, OFF in prod, flag read from GET /api/flags/holding-caps; b67 P3: polygon-ecosystem-token is POL, MATIC is an alias and still finds POL in search, ticker crypto row stays 11 coins; noindex audit guard on sitemap pages) (src/lib/must-fix/goal-b68.test.ts): marker `pull-check:v3-g10-b73-2026-10-28`
- Goal b69 (TT b68 P2s: /api/crypto deduped by CoinGecko id after the rename step, higher rank kept, 400 unique ids; REG-1 one-time chunk-load retry) (src/lib/must-fix/goal-b69.test.ts): marker `pull-check:v3-g10-b73-2026-10-28`
- Goal b70 (G-10: the holdings row paints from the confirm at once and a snapshot read taken before the trade can no longer overwrite it; a delete takes the holding off with the cash, no duplicate rows; P3: the-open-network shows GRAM like /api/crypto, and "ton", "toncoin" and "gram" find it) (src/lib/must-fix/goal-b70.test.ts): marker `pull-check:v3-g10-b73-2026-10-28`
- Goal b71 (TT b70 P3: one DELETE per ledger id — repeated clicks, journal replays and delete-on-arrival share the in-flight request; an id already confirmed removed sends nothing; a 404 for a real id counts as removed, silently) (src/lib/must-fix/goal-b71.test.ts): marker `pull-check:v3-g10-b73-2026-10-28`
- Goal b72 (TT b71 P2, 2nd attempt: delete replay after reload — the reload dropped the DELETE's 200, so the pending-writes journal replayed it. Queued deletes for an id are cleared on 200/204/404 in every path; on load, queued deletes whose id is missing from a fresh /api/transactions are dropped unsent; the server answers 204 for an id this user already deleted, 404 otherwise (b40)) (src/lib/must-fix/goal-b72.test.ts): marker `pull-check:v3-g10-b73-2026-10-28`
- Goal b73 (G-10, cause from trace bc-47cf729a: the optimistic and confirmed paints left marketPriceLocal null and the fill had no currency, so the row read "1 × —" until the snapshot read. The paint now seeds the price from the confirmed fill and the currency from the trade, the open position, or the market (.NZ NZD, .AX AUD, rate 1 = NZD); the server snapshot replaces it with no duplicate) (src/lib/must-fix/goal-b73.test.ts): marker `pull-check:v3-g10-b73-2026-10-28`
