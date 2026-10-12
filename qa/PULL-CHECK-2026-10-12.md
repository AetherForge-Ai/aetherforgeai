# Pull check — 12 Oct 2026

`pull-check:v3-tier1a-2026-10-12`

This file covers U3, U7, V1, and P1. `qa/PULL-CHECK-2026-10-10.md` stays and is marked superseded. H2, H1, and T1–T5 belong to another agent. H4, L8, L10, the Low items, and S1 belong to a later agent. This PR does not Publish, send email, run a Totalum AI Pull, or add GST.

Repo: https://github.com/AetherForge-Ai/aetherforgeai
Branch: `cursor/qa-u3-u7-v1-p1-04e9`
Base: `develop` at `add1d4e` (Keep a last-good crypto and DEX list when the live feeds are blocked, #318).
Draft PR: opened against `develop`. Do not merge.

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

This runtime has no cron. `wrangler.jsonc` does not contain a cron trigger, and the product-note route already says no cron is installed. A page read returns the persisted snapshot (Workers Cache, a temp file, and the hidden AF-CGS / AF-DXS watchlist rows from #318 when the JSON fits). If that snapshot is missing or older than 30 minutes, the read starts one background refresh. A short Worker isolate can freeze that work when the response ends. `GET` or `POST /api/cron/crypto-snapshot` runs the same job to completion when `CRON_SECRET` matches (`key`, `secret`, `x-cron-secret`, or `Authorization: Bearer`). If `CRON_SECRET` is unset the route stays closed, refreshes nothing, and sends no email. A new list replaces the stored one only when it is complete: at least 95% of 400 rows, each with a name and a price, and a chain or a DEX name. A short fetch keeps the previous list.

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

Status: fixed in code. Koins ranks only the CoinGecko half of the snapshot. A window is ranked only when the snapshot is under 60 minutes old and at least 80% of the candidate rows have a real change for that window. Missing changes stay null. Gainers are positive only. Every sweep carries a prints-under-review line, including zero. Stable, wrapped, and staked symbols are excluded. If at least half of the projected movers share one projection and confidence, that list is cleared and the unavailable sentence is shown. Crypto projections stay paused. Stox ranking is unchanged.

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
- The audit note contains `live=<number>`, not `live=n/a`, for a crypto fill.
- The panel does not show `Price must be greater than zero.` Review stays disabled until a price is present or typed.
- `No price came back` is not shown while `/markets` has a price for that token.

## P1 — partial

Status: partial. Confirm no longer calls the live crypto quote or the DEX search before it returns. When the reviewed FX rate is present, the historical Frankfurter call is skipped. A cold FX snapshot is bounded at 450 ms and then the baseline table is used. The route's movement check is not repeated inside the write. The holding mark is updated from the snapshot after the response is free to return. Confirm is disabled while `saving` is true. One Review sends one idempotency key. A second click in the same process waits on the first write, and the key is stamped into notes.

This is not one SQL transaction. Totalum writes the holding, the cash balance, and the ledger row one call at a time, with the existing rollback if a later call fails. The FIFO lot read still queries up to 5,000 ledger rows and can dominate the wait. The idempotency map lives in one isolate, so two isolates can still each write once. The CSV export was not changed; its speed is the ledger read, and its columns are unchanged.

Commit: `dbf4774`. Tests: `5d863ff`.

Files:

- `src/lib/transactions.ts`
- `src/lib/confirm-once.ts`
- `src/lib/trade-schema.ts`
- `src/app/api/transactions/route.ts`
- `src/components/dashboard/RecordTransactionPanel.tsx`

Verify:

1. Record WOR buy, WOR sell, PEPE buy, PEPE sell, and UNI buy. Time the toast `Transaction recorded`.
2. Double-click Confirm on one Review and count ledger rows.
3. Download the transactions CSV and note when the download starts.
4. Read the server log for `[transactions] step`.

Exact expected strings:

- Toast: `Transaction recorded`.
- Button while saving: `Saving…`, and the button is disabled.
- Log lines: `[transactions] step movement-check`, `live-spot`, `fx-snapshot`, `historical-fx`, `fifo-lots`, and `revalue`.
- Notes contain `live=<number>` and `idem=<key>`.
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
