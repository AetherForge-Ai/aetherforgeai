# Fix prompt v3 for AetherForgeAI Manager: QA retests of 11 Oct 2026

**Prepared:** 12 Oct 2026 (NZ time).
**Sources, newest first:**
- `retest-2026-10-11c-pub/signed-in.md` and `public.md` (11 Oct 2026, 1:27–1:37 pm NZDT)
- `tax-regression-2026-10-11b/paid.md` and `free.md` (11 Oct 2026, 8:27–8:40 am NZDT, build develop 9dedb719)
- `retest-2026-10-11b-pub/signed-in.md` and `public.md` (11 Oct 2026, 7:16–7:30 am NZDT)

**Item IDs:** IDs from the 10 Oct prompt (`crawl-2026-10-10/MANAGER-PROMPT.md`) are reused: U, H, M, L, V. New items from this round use **T** (tax and ledger maths), **P** (performance and saving) and **S** (Scorecard). Quote the IDs in commits, PR titles and your reply.

This prompt lists **only what is still failing or newly broken**. The order of the sections is the order to work in. Everything that passed is in one "do not regress" line just below the rules.

---

## Ground rules (unchanged, read first)
1. **Do not Publish.** You write the code and merge it to develop/main. Lukas reviews and Publishes. Never press Publish or deploy to production yourself.
2. **No outbound email without Lukas's approval for each send.** This includes test sends. Email features stay behind a flag that is off by default. The report toast must keep saying "Report saved below. No report email was sent." while the flag is off.
3. **Keep every existing Stox, Koins and Headmaster list and section.** That means the projected top 10, the not-sized lists, pathways, the 24 h, 7 d and month sweeps, synthesis, strategy and the Closed-call score box. You may fix their data, sorting, labels and empty states. You may not remove, rename or cut them. If the data for a list is bad, the list stays on the page and shows an "unavailable" state (see U7).
4. **Formats everywhere** (UI, CSV, reports):
   - NZ$ amounts have 2 decimal places (NZ$11,743.36, NZ$0.00).
   - FX rates have 4 decimal places (1.2439).
   - Sub-cent unit prices keep their significant digits in their own currency (US$0.000004).
   - Dates look like "12 Oct 2026". Date-times look like "12 Oct 2026, 1:30 pm" in NZ time.
   - Never show negative zero, ISO or UTC to users.
   - Prices in US dollars always use the "US$" prefix, never a bare "$".
5. **No passwords, API keys or tokens** in code, commits, logs, the pull-check file or your reply. API keys (for example a CoinGecko key) go in server environment variables. Ask Lukas to set them and name only the variable.
6. **No production data changes without Lukas.** Any backfill or recompute of stored rows (T1, T5) ships as a script with a dry-run output in the PR. Lukas approves it before it runs against production.
7. Keep changes small and reviewable, with commits grouped by item ID.

**Do not regress (these passed on 11 Oct 2026; keep them working):**
- Trades: trade Date equals DateTime_NZ, and new rows keep their time of day ("11 Oct 2026, 1:30 pm"). Past-dated buy. Negative-cash block ("This would take cash below zero.").
- Cash and reconciliation: header CASH BAL equals Transaction Centre cash. Cash equals the ledger CashNZD sum. Net worth equals cash plus holdings. "Value in stocks" updates live without a reload.
- Tax and dividends: dividend payment-date rate (1.2435 → NZ$6.22). Income CSV "Cash without breakdown NZD" column with NZ$25.00. The FIF page no longer contradicts itself ("Australian listings are included in the highest cost above."). All /tax pages and the sub-nav. Free-plan CSV gating ("Starter and above · See plans", API 403 `not_entitled`). Signed-out tax pages (no data, no CSV, /tax/realised.csv 404).
- Account and dashboard: metals holding and "Totals owned". "Welcome, QA Free". Empty-book cards consistent. Report toast "Report saved below. No report email was sent.". Run gate. Headmaster loads in 4.2 s.
- Crypto basics: PEPE/UNI DEX badge in search. U1 sub-cent precision.
- Public site: /ledger → /dashboard/transactions. M14 headers (HSTS 1 year with includeSubDomains, Permissions-Policy, CSP). 404 page and title. Canonical and og:url. U4 consent. U5 paper-book copy. H7, H9, H10, H11. M5, M6, M7, M8, M9, M10, M12, M13. M15 h1s. L7, L13, L14, L15, L16.

---

## URGENT

### U3 (reopened, widened). One cached server-side market snapshot for all crypto views
**What's wrong.** The two views disagree, and neither meets the spec.

Signed in, /markets?tab=crypto (after load, reload and a tab switch):
- The tab is empty: "Live crypto prices are not shown right now. Please try again shortly." … "No earlier price is stored." It has 0 rows.
- After switching tabs, the URL reads `?tab=dex` while the Crypto tab is shown.

Signed in, DEX tab:
- The count line says "12 names in the crypto list", then "DEX top 20" and "Showing 12 of up to 400".
- CHAIN and DEX are "—" on every row. They were filled in the 7:16 am run.
- The rows are mostly CEX coins (STRK, ONDO, QNT, PEPE, BAT).
- Prices mix "$0.01662" in the table with "US$0.01662" in the snapshot list.
- Both pills are highlighted, and the count line says "crypto list" on the DEX tab.

Public (signed out), Crypto tab:
- It reads "Showing 89 of up to 400 ... CoinGecko did not return a market list (rate limit or the feed did not answer). This list is the backup feed."
- The Blockchain column is "—" on 89 of 89 rows.
- 50 of 89 names equal the ticker (H8). Examples: BNB, XRP, USDC, TRX, INJ, TIA, NEO, JTO, ROSE, SEI, ALGO, ONDO, MKR, XLM, BCH, HBAR.

Public, DEX tab:
- It reads "Showing 87 of up to 400 · The rate limit stopped the list."
- There are duplicate rows: QI ×2, and ALTAI ×2 at US$0.000580523 and US$0.000122357, both PumpSwap Solana.
- The text "Last good ·" leaks into ticker, name and price cells (PAPER, ALTAI, SAFU, SIB, TM).
- Prices mix "$" and "US$".

**Why it matters.** This is the headline published feature, and it is visibly broken. Signed-in users see less than signed-out visitors. The same snapshot feeds the Add panel (V1) and Koins (U7). When it breaks, it causes wrong prices and fake rankings downstream.

**Root-cause hypothesis.**
- Each view calls CoinGecko and GeckoTerminal live, per request or per user. The free-tier rate limits then cut off the list at a different point for each caller.
- Signed in and public use different code paths and fallbacks: the public view falls back to the 89-coin backup list, while the signed-in view falls back to an empty state.
- The backup list has no names or platforms.
- DEX rows are built per pool, not per token, which causes the duplicates.
- The stale label is concatenated into the display strings instead of being a separate field.

**Fix direction.**
1. Add **one server-side snapshot job**, run by a scheduler or cron and never on page load.
2. **CoinGecko half:** the top 400 by market cap from `/coins/markets` (vs_currency=usd, 2 pages of 250, trimmed to 400). Join with `/coins/list?include_platform=true`, cached for 24 h, to get the **name** and **platform**.
   - Blockchain = the native chain for L1 coins ("Bitcoin", "Ethereum", "Solana", "Cardano").
   - Otherwise it is the primary `asset_platform` ("Ethereum", "BNB Smart Chain", …).
3. **GeckoTerminal half:** the DEX top 400 tokens by 24 h volume. Page with backoff inside the published rate limit. Deduplicate by `network + token address`, keeping the highest-liquidity pool. Keep chain, DEX name, price and pool address.
4. Store the snapshot with `fetched_at` (UTC) in the database or KV. **Only replace the stored snapshot when a fetch is complete.** Complete means at least 95% of the target rows, all with a name and a price. Otherwise keep the last good snapshot.
5. **Every consumer reads only from this snapshot:**
   - public /markets (Crypto and DEX)
   - signed-in /markets (Crypto and DEX)
   - Add panel search and the price prefill (V1)
   - the Sell form prefill
   - the Koins sweep and projected movers (U7)
   - the ticker strip
6. **Stale data is shown with one label above the table**, never inside a cell: "Prices as at 12 Oct 2026, 4:05 pm (NZ). The feed is delayed." Use this when the snapshot is older than 30 minutes. Delete the "Last good ·" cell text.
7. Use one US$ price formatter, with adaptive decimals for sub-cent prices.
8. Tab state:
   - The URL `?tab=crypto` or `?tab=dex` always matches the visible tab.
   - Exactly one pill is highlighted.
   - The count line says "coins" on Crypto and "DEX tokens" on DEX, with the real count.
9. If a CoinGecko Demo or Pro key would make the 400 reliable, tell Lukas the variable name and the cost. Do not commit a key.

**Expected result at retest** (signed out and signed in, compared at the same minute):
- [ ] Crypto shows "Showing 1–25 of 400". Signed out and signed in show the same first 25 tickers, in the same order, with the same prices and the same "Prices as at …" time.
- [ ] Name ≠ Ticker on every row, except a short allowlist of coins whose official CoinGecko name is the symbol (BNB, XRP, USDC). Expected names include "TRON", "Injective", "Celestia", "Algorand", "Stellar", "Bitcoin Cash", "Hedera", "Jito", "Sei", "Ondo".
- [ ] Blockchain is filled on at least 95% of rows (no "—" on BTC, ETH, SOL, ADA, BNB, XRP, USDC).
- [ ] DEX shows "Showing 1–25 of 400" (or an honest "N of 400" with the "Prices as at" label). Chain and DEX are filled on 100% of rows. There are 0 duplicate network+address pairs (no QI ×2, no ALTAI ×2). There are 0 cells containing "Last good". Every price starts with "US$".
- [ ] The URL tab equals the visible tab. One pill is highlighted. The counts read "coins" and "DEX tokens".
- [ ] Each tab loads in 3 s or less.
- [ ] When the feed is down, the last good snapshot still shows with its "Prices as at" label. The signed-in Crypto tab is never empty while the public one has rows.

### U7 (new; the Koins half of H2). Koins must say "data unavailable", never show fake rankings
**What's wrong.** In the 11 Oct 1:3x pm Koins run:
- The 24 h sweep reads "1. QI 0.00% 2. ALTAI 0.00% … 10. GIGATENEV 0.00%". All ten rows are 0.00%.
- The 7 d "gainers" list contains losses: "TART -89.52%", "GIGATENEV -91.96%".
- The month list shows "ORBIO +101.51%".
- Every projected mover is "+12.00%" at 40–41% (ALTAI, CLAUDIA, CYBERLEEK…).
- Only the 7 d list shows "1 print under review". The 24 h and month lists show no line.
- In the 7:16 am run the lists still had stablecoins and wrapped tokens (USD0 +91.03%, WEETH +88.72%, BTC.B +78.33%).

**Why it matters.** These are fabricated rankings presented as analysis. A "gainer" at -91.96% and a uniform +12.00% at 40% are visibly fake. That destroys trust and is a compliance risk.

**Root-cause hypothesis.**
- While CoinGecko is down, Koins falls back to the thin GeckoTerminal or backup data, where the 24 h and 7 d change is missing.
- Missing values default to 0.
- The "gainers" are sorted by absolute move, or not filtered to positive moves.
- The projection model returns its prior (+12.00%, about 40%) when it has no inputs.

**Fix direction.**
1. Koins reads only from the U3 snapshot.
2. Add a **data-quality gate before ranking.** Rank only when:
   - the snapshot is under 60 minutes old, and
   - at least 80% of candidate rows have a real (non-null) change value for that window.
3. If the gate fails, the section stays on the page and shows exactly: "Crypto market data is unavailable right now, so this list is not ranked. Last good snapshot: 12 Oct 2026, 4:05 pm." Use the real time.
4. Missing changes are null, never 0.00%.
5. A gainers list contains only positive moves. If fewer than 10 qualify, show the real number with "Only N coins gained over 7 days."
6. If at least 50% of projected movers share the same projection and confidence, treat the projection as unavailable and use the same message.
7. Keep excluding stablecoins, wrapped and staked tokens (USD0, USX, WEETH, BTC.B, EZETH, CBBTC, any homoglyph USDT).
8. Show the "N prints under review" line on every sweep (24 h, 7 d, month), including "0 prints under review".

**Expected result at retest:**
- [ ] With the feed healthy, no sweep row reads 0.00% unless that coin really moved 0.00%.
- [ ] No negative value in any "gainers" list.
- [ ] Projected movers have varied projections and confidences.
- [ ] No stablecoin or wrapped token appears.
- [ ] Every sweep shows a "prints under review" line.
- [ ] To test the failure path, simulate a feed failure (a staging flag is fine). Every Koins list section is still present and shows the exact "Crypto market data is unavailable right now…" text. There are no ranked rows and no +12.00%/40% rows.

---

## HIGH

### V1 (regression). The Add panel live price for PEPE and UNI
**What's wrong.**
- Add panel → search PEPE or UNI. The DEX badge shows ("PEPEPepe DEX", "UNIUniswap DEX").
- But both say "No price came back. Type the price you want to record.", and the Price field is empty (shots/06, 07).
- UNI filled at 7:16 am ("Today's price is filled in." 7.53) and at 2:53 am (7.63), so this is a regression.
- The UNI **Sell** form did fill a price ("Today's price is filled in" 7.58), and the PEPE sell filled 0.000004. The CSV audit shows "live=n/a".

**Why it matters.** The Add panel price is the main path for recording a crypto trade. Users have to type prices by hand.

**Root-cause hypothesis.** The Add and Sell forms use different price resolvers. Add looks the price up by CoinGecko id, which failed during the outage, and has no DEX fallback. Sell has a GeckoTerminal or "recent print" fallback.

**Fix direction.**
1. Use one shared price resolver for Add, Sell and the Review step, in this order:
   1. the U3 snapshot (by CoinGecko id or network+address)
   2. the live GeckoTerminal token price by network+address
   3. the last stored print, labelled "Live price was unavailable. A recent print is filled in (12 Oct 2026, 4:05 pm)."
2. Keep the DEX badge and chain through Add, Sell and the ledger (M2).
3. Show "Fetching today's price…" until the price resolves. Block Review until a price is present or the user types one, so users never see "Price must be greater than zero.".

**Expected result at retest:**
- [ ] Add → PEPE shows "Today's price is filled in. You can type over it." with a price like 0.000004 (significant digits kept). Add → UNI shows the same text with a price of about 7.5.
- [ ] Never "No price came back" while /markets shows a price for that token.
- [ ] The CSV audit reads "live=<number>", not "live=n/a".

### H2 (Stox half). Implausible gains are still listed despite "prints under review"
**What's wrong.** The run of 11 Oct, about 1:33 pm, shows "3/4/12 prints under review", but still lists:
- NZX 24 h: "1. GXH.NZ +34.61%" (new), "3. CNU.NZ +17.24%" (Markets: "CNU Chorus NZ$8.40 0.00%"), "EBO.NZ +16.45%" (Markets +0.74% at 7:16 am), "TRA.NZ +15.45%" (Markets −0.41%).
- ASX: "FLT.AX +39.22%", which also tops "Top gainers identified", and "AMC.AX +34.14%" (24 h) / "+53.34%" (month).
- US: "PAYX +28.50%". At 7:16 am "GOOG +16.68%" was also listed.

The figures for CNU, EBO, TRA, AMC, FLT and PAYX have not changed since the 2:53 am run, so they are stale.

**Why it matters.** The reports are built on bad prices. The flag counts the problem rows but still shows them, and they drive the picks and the "Top gainers" copy.

**Root-cause hypothesis.**
- The guard increments the "under review" counter but does not remove the flagged rows from the ranked list.
- Stox uses a different quote source or previous close than /markets, and that source has stale data, so the same figures repeat across runs. The cause may be a wrong previous close, a split or adjustment, or cents vs dollars.

**Fix direction.**
1. Stox uses the same quotes and previous close as /markets.
2. Cross-check every ranked row against /markets. If the difference is over 2 percentage points, or the same % repeats across 2 or more runs while the price changed, the row is "under review".
3. Rows under review are **not ranked**, not used in "Top gainers identified", and not used for sizing. They show as "CNU.NZ — print under review" with no %, below the ranked list.
4. Keep the configurable large-cap guard (about 20%).
5. Log the rejected rows with both values.

**Expected result at retest:**
- [ ] In a new Stox run, every ranked NZX, ASX and US row is within 2pp of the same ticker on /markets at that time.
- [ ] CNU.NZ either matches Markets (for example 0.00%) or appears only as "CNU.NZ — print under review".
- [ ] GXH.NZ, FLT.AX, AMC.AX and PAYX either match Markets or are under review.
- [ ] "Top gainers identified" names only ranked rows.
- [ ] All lists are still present.

### T1 (new). Realised P&L: FIFO -NZ$10.67 vs ledger and income -NZ$10.59, a wrong lot date, and the M11 residual
**What's wrong.**
- /tax/realised reads "Total -NZ$0.08." (other) and "Total -NZ$10.59." (crypto), then "Combined realised -NZ$10.67. … 2 rows differ from the amount stored on the sell."
- The ledger reads "REALISED P&L (PRICE + FX) · YTD -NZ$10.59". /tax/income reads "Realised -NZ$10.59." The CSV RealizedPnlNZD sum is -10.59.
- The difference is two WOR.AX sells (10 Oct and 11 Oct, 3:04 am), each shown as "Ledger stored NZ$0.00 on this sell. This FIFO line is NZ$-0.04."
- **M11 (same cause):** /dashboard/stocks shows "WOR AUD … 1,000 AU$9.44 AU$9.44 AU$9,440.00 … -AU$0.16 0.00%" with price = cost. The AU$0.16 is exactly 2 × (9.52 − 9.44) from the two past-dated 1 Oct buys at AU$9.52.
- **Lot date:** today's 1:30 pm WOR buy shows on /tax/realised as "Lot 10 Oct 2026 · qty 1 · cost NZ$11.74", while the ledger dates it 11 Oct 2026.

**Why it matters.** Three tax pages give two different realised totals, and the holdings page shows a loss on a position priced at cost. Users exporting for IRD get inconsistent numbers.

**Root-cause hypothesis.**
- The ledger and holdings use **weighted-average cost**, and /tax/realised uses **FIFO**.
- Under average cost, the two AU$9.52 lots were blended into the 1,000-share average, so the sells stored NZ$0.00 and AU$0.16 of cost stayed in the remaining position.
- Under FIFO, those lots were consumed: 11.74 − 11.78 = −0.04 each.
- The realised lot builder reads an old date field (the merged position's first-bought date, or the pre-fix Date value) instead of the fixed NZ calendar date of the buy.

**Fix direction.**
1. **Use one cost method everywhere:** ledger, holdings gain, /tax/realised, /tax/income, /tax page, CSVs and Headmaster. QA recommends FIFO, which /tax/realised already uses. Ask Lukas to confirm.
2. Show the method once on each page: "Cost method: FIFO (first in, first out)."
3. Store the realised price/FX split on every sell (this also fills the CSV split columns, T3).
4. Add a recompute script for the stored realised amounts on past sells. Show the dry-run output in the PR. Lukas approves it before it runs in production.
5. Lot dates come from each buy row's NZ calendar Date.

**Expected result at retest** (on the current QA book, after Lukas approves and the recompute runs):
- [ ] Ledger YTD, /tax/income "Realised", the /tax "Realised profit and loss" line, /tax/realised "Combined realised" and the CSV RealizedPnlNZD sum all show the same value: **-NZ$10.67** under FIFO.
- [ ] No "rows differ from the amount stored" line.
- [ ] /dashboard/stocks WOR shows a gain of "AU$0.00 0.00%" when the price is AU$9.44, and (price − 9.44) × 1,000 at other prices.
- [ ] A new buy made today shows on /tax/realised as "Lot 12 Oct 2026".

### H1 (MAH.AX, still open). The #1 projected mover is "not a buy" with no explanation next to the list
**What's wrong.**
- Stox "Next 7 days · Top-10 projected movers" reads "1. MAH.AX · ASX AU$1.11 +5.56% 65%".
- The same report says "Not sized this week … MAH.AX the rating is not a buy".
- The only link is in Aggressive Alpha: "They are not the top of the projected list. The projected list leads with MAH.AX & RSG.AX." There is no rating-vs-ranking note at the list itself.
- This has been unchanged in 3 runs (2:53 am, 7:16 am, 1:33 pm).

**Why it matters.** It reads as a contradiction (a top pick that is not a buy). The Scorecard design flags it automatically as a "#1 mover not rated buy".

**Root-cause hypothesis.** The projected list is ranked by projected % alone. The rating applies separate filters (liquidity, price floor, suitability cap, volatility), and the two are never joined in the list.

**Fix direction.** Keep the list and its order. Add a one-line note above it: "Ranked by projected 7-day move only. A rank is not a buy rating; each name's rating is shown." Add a rating cell to each row: "BUY" / "HOLD" / "Not a buy: <reason>".

**Expected result at retest:**
- [ ] The projected list shows the note text exactly.
- [ ] The MAH.AX row reads like "1. MAH.AX · ASX AU$1.11 +5.56% 65% · Not a buy: <specific reason>".
- [ ] The reason matches the "Not sized" entry.
- [ ] The list still has 10 rows.

### P1 (new). Saves take 10–40 s; the first Confirm hangs on "Saving…"
**What's wrong.**
- The first Confirm (PEPE buy) stayed on "Saving…" for more than 15 s, and about 20–40 s in total. Other Confirms took about 10 s each.
- The first click on the dividends CSV download took more than 15 s.
- In the 7:16 am run, the ledger still showed "latest 5 of 27" with old cash right after a Confirm, and the tester bought twice by mistake (2 × WOR).

**Why it matters.** Slow saves cause duplicate trades and abandoned entries.

**Root-cause hypothesis.** The Confirm handler synchronously re-fetches live prices and FX and revalues the whole book through the rate-limited feeds before it returns, and there is a cold start on the first call.

**Fix direction.**
1. Confirm writes the reviewed price, FX and cash in one database transaction and returns.
2. Revaluation runs afterwards from the U3 snapshot.
3. Add an idempotency key per Review, so a double click or retry can't create two rows.
4. Disable Confirm while saving.
5. Add a timing log per step.

**Expected result at retest:**
- [ ] Each of 5 consecutive Confirms (WOR buy and sell, PEPE buy and sell, UNI buy) reaches "Transaction recorded" in 3 s or less. The first one takes 5 s or less.
- [ ] Double-clicking Confirm creates exactly 1 ledger row.
- [ ] The first CSV download starts in 3 s or less.

---

## MEDIUM

### T2 (new). Tax CSV filenames and trailing newlines
**What's wrong.**
- The tax exports are named by tax year only: "realised-pl-2027.csv", "taxable-income-2027.csv", "dividend-ledger-2027.csv". Re-downloads become "(2)" and "(3)".
- **None** of the 4 CSVs ends with a newline. The last byte is `"` in the 3 tax files and `.` in transactions-2026-10-11.csv.

**Fix direction.**
- Use the same pattern as the transactions export (`transactions-2026-10-11.csv`): `realised-pl-2027-2026-10-12.csv`, `taxable-income-2027-2026-10-12.csv` and `dividend-ledger-2027-2026-10-12.csv`, where 2027 is the tax year and the second part is the NZ export date. A file name is a machine field, so YYYY-MM-DD is fine there. On-screen text still uses "12 Oct 2026".
- Every CSV ends with exactly one line terminator, the same one used on the other lines.

**Expected result at retest:**
- [ ] The file names match the pattern above with today's NZ date.
- [ ] `tail -c1 <file> | xxd` shows `0a` for all 4 files.

### T3 (L9/M10, still open). Blank CSV columns: fill them or remove them
**What's wrong.** transactions CSV, 50 rows:
- PriceAsAt, SignalPrice, MarkPriceAtExport, NotionalNative, Broker and Chain are blank on all 50 rows.
- Venue is blank on 30 rows. Only DEX trades have "DEX".
- RealizedPricePnlNZD and RealizedFxPnlNZD are blank on all 17 sells ("Price and FX split was not stored").
- FxRate is blank on the NZD deposit and on the PFI.NZ dividend.
- New 1:30 pm rows still say "Quote time was not stored."

**Fix direction.**
- **PriceAsAt:** store the quote time on every new trade ("11 Oct 2026, 1:30 pm"). Old rows say "not stored".
- **MarkPriceAtExport:** fill it with the snapshot price at export time.
- **NotionalNative:** remove it. It duplicates NativeNotional.
- **SignalPrice:** remove it, or fill it only on bot-signal fills and say so in the Data note.
- **Broker:** remove it. This is a paper book.
- **Chain:** fill it for DEX and crypto rows (for example "Ethereum", "Solana").
- **Venue:** fill it on every row: "NZX", "ASX", "NYSE" / "NASDAQ", "CoinGecko", "DEX: <name>", "Cash".
- **FxRate:** use "1.0000" on NZD rows.
- **Realised split:** fill it from T1.
- Keep every remaining column header in its current order. List any removed headers in the pull-check file.

**Expected result at retest:**
- [ ] No column is blank on every row.
- [ ] Venue is filled on 50 of 50 rows. Chain is filled on all crypto rows.
- [ ] FxRate is 1.0000 on NZD rows.
- [ ] The sell rows have both split values, and price + FX = RealizedPnlNZD to 2dp.

### T4 (new, minor). FIF cost is 0.01 off the ledger
**What's wrong.** /tax/fif shows "WOR.AX: cost NZ$11,743.35." The ledger holds -11,743.36.

**Root-cause hypothesis.** The FIF page rounds per lot and then sums, while the ledger rounds the total (or the reverse).

**Fix direction.** Use one money path: sum at full precision and round once to 2dp. Use the same cost source as T1.

**Expected result:** /tax/fif shows "WOR.AX: cost NZ$11,743.36." (with the book unchanged), and it equals the ledger.

### H4 (new symptom). The header briefly shows NZ$11.74 holdings after a buy, and the sell form lags
**What's wrong.**
- Right after the WOR buy Confirm, the header read "HOLDINGS VALUE NZ$11.74 · TOTAL NET WORTH NZ$33,307.61 · VALUE IN STOCKS NZD NZ$11.74 · CRYPTO NZ$0.00 · METALS NZ$0.00" before it corrected. Then the values counted up: "CASH BAL NZ$33,307.08" → "33,307.28" → "33,307.61".
- At 7:16 am a sell straight after a buy first showed "You don't hold this asset, so it can't be sold." until holdings loaded.

**Root-cause hypothesis.** The client puts the mutation response, which holds only the single trade, into the portfolio-totals store before the full refetch. A count-up animation then runs from that wrong base. The sell form validates against holdings that are still loading.

**Fix direction.**
- Never replace totals with a partial response. Keep the previous totals, with a subtle "updating" state, until the full refetch lands, or have the server return the full totals.
- Remove the count-up on monetary values.
- The sell form waits for holdings ("Checking holdings…") instead of rejecting.

**Expected result at retest:**
- [ ] Screen-record a WOR ×1 buy. The header never shows NZ$11.74 holdings or NZ$0.00 crypto or metals. It goes straight from NZ$31,722.42 to NZ$31,734.16 (or the equivalent at current prices).
- [ ] Cash never shows an intermediate value.
- [ ] A sell straight after a buy never shows "You don't hold this asset".

### L8 (still open; partial). Slow loads
**What's wrong.**
- The first dashboard visit took about 29 s, landing on the logged-out page.
- Signed-in dashboard reloads took about 7.7–7.8 s until values showed.
- The ledger took 2.4 s for the shell and 4.8 s for values.
- The Crypto tab took about 4 s to resolve to an empty state.
- Stox run: 16 s. (Headmaster improved to 4.2 s.)

**Root-cause hypothesis.**
- The session check and the data fetches run one after the other.
- Live feed calls happen inside page requests.
- There are cold starts.

**Fix direction.**
- Run the session check in parallel with the data fetches, or do it in middleware.
- Serve prices from the U3 snapshot.
- Cache the per-user totals.
- Measure and report the p50 and p95 load times in the pull-check file.

**Expected result at retest:**
- [ ] First visit, signed out → /login (or the public page) in 5 s or less.
- [ ] Signed-in dashboard values in 3 s or less (warm) and 6 s or less (cold).
- [ ] Ledger values in 3 s or less.
- [ ] Crypto tab in 3 s or less.

### T5 (new, data). Rows written during the 8:3x am run have no time of day
**What's wrong.** Rows from the 8:27–8:40 am build have DateTime_NZ "11 Oct 2026" with no time. Examples: the WOR and UNI round trips and the WOR dividend. Later rows are fine.

**Fix direction.** If created_at is stored, backfill DateTime_NZ from it, using the same dry-run and Lukas approval as rule 6. If it is not stored, write "time not stored" in the Data note.

**Expected result:** Those rows read "11 Oct 2026, 8:3x am", or carry the Data note text.

### L10 / U2 (decision needed). PFI "first bought" and correction dates
**What's wrong.**
- /dashboard/stocks shows "PFI … first bought 10 Oct 2026 · NZX". The only 9 Oct row is a correction.
- Corrections recorded on 11 Oct are dated 10 Oct, the lot date, so they are missing from "latest 5".

**Fix direction.** Ask Lukas which date is right. QA's view: first bought = the date of the earliest buy row (10 Oct 2026 is consistent), and a correction's ledger Date = the day it was recorded, with the lot date shown in the note. Implement whatever he chooses.

**Expected result:** As decided, and stated in the pull-check file. A correction made today shows today's date and appears in "latest 5".

---

## LOW

- **H8 (folded into U3).** No raw-ticker names. Retest it under U3.
- **H3 copy.**
  - Problem: Headmaster says "Amounts are the whole-dollar gap to the target weight" while showing cents.
  - Fix: change it to "Amounts are the NZ$ gap to the target weight."
  - Expected: the new text exactly.
- **Koins HOLD with a size.**
  - Problem: "HOLD ADA" still shows "Illustrated size NZ$7,947.20".
  - Fix: a HOLD shows "No new size: HOLD."
- **Report Center flash.**
  - Problem: "0 / 51 per bot" shows before "4 / 51 per bot".
  - Fix: show a skeleton until the count loads.
  - Expected: no 0 / 51 flash on reload.
- **M1 note.**
  - Problem: the user's correction note is in the CSV but not shown in the ledger UI.
  - Fix: show it under the row.
  - Expected: "Note: QA M1 revert 11 Oct" is visible.
- **Logout.**
  - Problem: leaving /logout ("Signing you out… Securely closing your session.") early leaves the session active.
  - Fix: invalidate the session server-side before the page renders, so navigating away still signs out.
  - Expected: open /logout, navigate away at once, and /dashboard is signed out.
- **Old CSV notes.**
  - Problem: "live=0.000004023323" (12 dp) appears on old PEPE rows.
  - Fix: write new audit notes with significant-digit formatting. Leave old rows unchanged unless Lukas approves.
- **/about title.**
  - Problem: "About AetherForge AI — Built in New Zealand, for New Zealanders — AetherForge AI" has the brand twice.
  - Fix: "About — Built in New Zealand, for New Zealanders — AetherForge AI".
- **404 og:url.** There is no og:url or canonical on the 404 page. This is harmless with noindex. Optional.

---

## SEPARATE, LOW PRIORITY (queued): S1 Stox & Koins Scorecard
Start this **only after** U3, U7, V1, H2, T1, H1 and P1 are merged. The design and a ready-to-use build prompt are in `scorecard/SCORECARD-DESIGN.md`. Section 7 is the prompt. Section 5.1 is the schema. Section 2.3 has the formulas. Follow it exactly. In short:
- **Phase 1:** a call logger. `bot_calls` is insert-only, one row per named ticker (PRIMARY, SUITABLE_NEW, NOT_SIZED, PROJECTED_MOVER). It flags contradictions such as a BUY with a projection of 0% or less and "#1 mover not rated buy" (MAH.AX).
  - Import `scorecard/calls-log-template.csv` as backfill (era 0) without changing any value.
- **Phase 2:** a scoring job with **no AI**. It runs daily at 9:00 am NZ and uses official closes from the bots' own source. Missing data → UNSCORABLE, never a silent substitute.
- **Phase 3:** a read-only page at `/dashboard/scorecard`, visible to the owner/admin only. It carries the banner "Paper scores only. Not financial advice. Past paper results do not predict future results." and is not linked to /performance.
- **Phase 4:** scheduled runs at 9:30 am NZ on a dedicated "Scorecard Paper" account. These need Lukas's budget OK first: report the AI cost of one report in NZ$ to 2dp. Scheduled runs never email and never use up customer allowances.
- Stop for Lukas's review after each phase. Formats: NZ$ 2dp, FX 4dp, % 2dp, "11 Oct 2026", "3:47 pm".
- **Expected for this round:** a design-acknowledgement note and a Phase 1 PR at most (insert-only proven by a failing UPDATE/DELETE test). Nothing scheduled, nothing emailed.

---

## What to send back
1. **The repo, branch, PR links and commit hashes** (develop and main), with the item IDs each commit covers. Give the full repo URL. Last round the pull-check file could not be found at the repo QA guessed.
2. **An updated pull-check file** at `qa/PULL-CHECK-2026-10-12.md`. Keep `qa/PULL-CHECK-2026-10-10.md` and mark it superseded. Also paste the full file content in your reply. For each ID (U3, U7, V1, H2, T1, H1, P1, T2, T3, T4, H4, L8, T5, L10/U2, the Low items and S1) include:
   - Status: fixed / partial / not done (with reason) / needs Lukas.
   - Commit hash and files changed.
   - The exact URL or screen and click steps to verify.
   - **The exact expected strings or values**, copied from the "Expected result at retest" lines above, updated if your wording differs.
   - Anything that needs Lukas: Publish, the cost-method decision (T1), approval of the recompute and backfill scripts (T1, T5), the CoinGecko key variable and plan (U3), the correction-date decision (L10/U2), the Scorecard budget (S1).
3. **Confirm in writing** that you:
   - did not Publish
   - sent no email
   - removed or renamed no Stox, Koins or Headmaster list or section
   - ran no production data change without Lukas's approval
   - put no credentials in code, commits, logs, the pull-check file or the reply.

---

## Retest checklist (Testing Technician, after Lukas Publishes)
Use the QA paper account. Record start and end cash, holdings and net worth. Book trades as ×1 or small round trips. Send no email.
- [ ] **U3:** Open /markets Crypto and DEX signed out and signed in at the same minute.
  - Both show 400 rows (or an honest count with "Prices as at …"), the same first 25, and the same as-at time.
  - Name ≠ Ticker except official names. Blockchain is filled on at least 95% of rows. DEX Chain and DEX are 100% filled.
  - 0 duplicate network+address pairs. 0 "Last good" cells. All "US$".
  - URL = visible tab, one pill, "coins" / "DEX tokens". Each tab in 3 s or less.
- [ ] **U7:** In a Koins run, there are no all-0.00% sweeps, no negative "gainers", no uniform +12.00%/40% movers, no stablecoins or wrapped tokens, and a "prints under review" line on every sweep. In the feed-failure test, every section shows "Crypto market data is unavailable right now, so this list is not ranked. Last good snapshot: <date, time>."
- [ ] **V1:** Add → PEPE and UNI show "Today's price is filled in. You can type over it." with a price. The CSV audit has "live=<number>".
- [ ] **H2:** In a Stox run, every ranked row is within 2pp of /markets. CNU.NZ, GXH.NZ, EBO.NZ, TRA.NZ, FLT.AX, AMC.AX and PAYX either match or show "— print under review". "Top gainers identified" names only ranked rows.
- [ ] **T1:** Ledger YTD = /tax/income = /tax = /tax/realised combined = CSV sum (-NZ$10.67 under FIFO, after the approved recompute). There is no "rows differ" line, WOR at AU$9.44 shows "AU$0.00 0.00%", and today's buy lot is dated today.
- [ ] **H1:** The projected list has the "Ranked by projected 7-day move only…" note, and MAH.AX shows "Not a buy: <reason>". It still has 10 rows.
- [ ] **P1:** 5 Confirms each take 3 s or less (the first 5 s or less). A double-click creates 1 row. The first CSV download takes 3 s or less.
- [ ] **T2:** The 3 tax CSVs are named `<name>-2027-<YYYY-MM-DD>.csv`. All 4 CSVs end in `0a`.
- [ ] **T3:** No all-blank CSV column. Venue is 50/50. Chain is filled on crypto rows. FxRate is 1.0000 on NZD rows. The split columns sum to RealizedPnlNZD.
- [ ] **T4:** /tax/fif shows "WOR.AX: cost NZ$11,743.36." and it equals the ledger.
- [ ] **H4:** On a screen-recorded WOR buy, the header never shows NZ$11.74 holdings or a NZ$0.00 crypto/metals flash, and there is no cash count-up. A sell straight after a buy does not show "You don't hold this asset".
- [ ] **L8:** Signed-out first visit takes 5 s or less. Dashboard values take 3 s or less warm and 6 s or less cold. Ledger and Crypto tab take 3 s or less.
- [ ] **T5:** The 8:3x am rows have a time or a "time not stored" note.
- [ ] **L10/U2:** The first-bought and correction dates follow Lukas's decision. A correction made today is in "latest 5".
- [ ] **Low:** The H3 copy, the Koins HOLD size, the 0 / 51 flash, the M1 note in the UI, early-leave logout and the /about title.
- [ ] **S1:** This is design acknowledgement or a Phase 1 PR only. Insert-only is proven, nothing is scheduled and nothing is emailed.
- [ ] **Do-not-regress sweep:** Check every item in the "Do not regress" line, especially:
  - Date = DateTime_NZ with the time kept
  - cash = ledger CashNZD sum
  - net worth = cash + holdings
  - Free-plan CSV 403
  - signed-out tax pages
  - U4 consent
  - M14 headers
  - all Stox, Koins and Headmaster lists present
  - the report toast "Report saved below. No report email was sent."
