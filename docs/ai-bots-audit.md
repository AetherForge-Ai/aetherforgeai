# Stox and Koins audit

This is how the two report bots work in this repo, what was measured, and what changed. Prices are delayed public prints. This repo does not ship a licensed or real-time NZX or ASX feed. Nothing here is a personal recommendation.

## What each bot is

Stox is the equity report (NZX, ASX, US). Koins is the crypto report. Both build a `SecurityIntel` row and then a canonical action. The shared engine is `src/lib/market-intel.ts`. The words Strong Buy, Buy, Hold, Reduce, and Sell are applied later by `signalFromScore` in `src/lib/security-signal.ts`. Public pages import the engine and keep the placeholder signal `Hold`.

There is no earlier tamper-proof prediction log, no fitted probability map, and no no-edge rule in the tree this work started from. What does exist is a closed-call count (`src/lib/report-topup.ts`): after seven days it records whether a later price sat in the bear, base, or bull band, or outside all three. That sentence is a count. It does not state a hit rate.

## Data sources

Equities. The default quote path is Yahoo Finance's public chart and spark endpoints (`src/lib/yahoo-finance.ts`), keyless and delayed. Twelve Data is used only when `MARKET_DATA_API_KEY` is set. The curated universe in `MARKET_UNIVERSE` carries a `basePrice` seed. That seed is not a fill price. A live report that has no quote for a name leaves the name out.

Crypto. The market list is CoinGecko, then CoinPaprika, CoinCap, and Binance public tickers, with Yahoo used for mapped majors when those lists are short. DEX rows come from GeckoTerminal and DexPaprika. Swyftx and DexScreener stay off unless their display flags are on. `CRYPTO_PROJECTIONS_PAUSED` is `true`. Koins still writes an outlook on a book that has positions, and the public projection list drops crypto rows.

The dashboard market route (`/api/market`) passes real Yahoo daily closes into `analyzeUniverse`. The Stox report path previously did not. It called `analyzeSecurity(ticker, livePrice)` with no history. That builds a seeded random walk that ends on the quoted price (`dailySeries`). RSI, MACD, the 7-day drift, the confidence, and the score were then functions of the ticker seed, not of the market. `applyMarketsSessionChange` overwrote only the 1-day percent with the quote. Koins `coinToIntel` does the same seeded walk, then blends it with the live 7-day change and clamps the blend to ±12%.

## Indicators and the 7-day outlook

On a real close series of at least 40 prints, the engine computes:

- SMA 20 and SMA 50, and the percent distance from each
- RSI(14)
- MACD(12, 26, 9) and a Bullish / Bearish / Neutral label from the histogram
- Bollinger position inside a 20-day, 2-standard-deviation band
- Close-to-close ATR as a percent, and 30-day realised volatility
- Swing support, resistance, and a floor-trader pivot
- A regime: High Volatility if daily vol is above 2.6% (shares) or 5% (crypto), otherwise Trending Up, Trending Down, or Range-Bound from the moving averages and the drift

The 7-day point forecast is a ridge regression on the last 30 closes (penalty 2.5 on standardised time), blended with an RSI mean-reversion nudge. The percent is capped at 25% for shares and 55% for crypto (25 × 2.2). Confidence starts at `45 + 45 × R²`, plus a small penalty for a large swing, and is clamped to 40–96. A capped extreme is forced to 40 or below. That number is a fit score. It was not a measured probability.

The base range is the drift plus or minus `0.674 × dailyVol × √7`, labelled 50%. Bull and bear are the outer tails to about `1.282σ`, with probabilities that tilt a little with the score. The base probability is fixed at 50.

## BUY / HOLD / SELL

`deriveSignal` starts at 50 and adds or subtracts:

- MACD histogram: ±10
- Price versus the 20-day average, beyond 2%: ±8
- RSI at or above 70: −12. RSI at or below 30: +12
- Bollinger position at or above 92 or at or below 8: ∓6
- The 7-day drift times 3, clamped to ±22

The score is clamped to 2–98. `signalFromScore` maps it:

| Score | Label | Canonical action |
| --- | --- | --- |
| ≥ 72 | Strong Buy | ACCUMULATE, and only if the 7-day midpoint is positive and MACD is not bearish |
| ≥ 58 | Buy | BUY, with the same blocks |
| ≥ 42 | Hold | HOLD |
| ≥ 28 | Reduce | TRIM |
| below 28 | Sell | SELL |

A bearish MACD turns a buy label into HOLD. A downtrend that is also MACD-bearish turns anything except Reduce or Sell into HOLD. A non-positive 7-day midpoint turns a buy into HOLD. High volatility or confidence under 48 sets conviction to Speculative. The report sizes at most a handful of new names and does not tell the reader to deploy the whole cash balance.

## xAI prompts

Grok does not choose the score. `createGrokChatCompletion` posts to `https://api.x.ai/v1/chat/completions`. `createZenithCompletion` prepends the directive in `src/lib/zenith.ts`: reason from the numbers supplied, do not invent prices, do not instruct the reader to buy or to deploy cash, and end with an informational disclaimer. The default model string is `grok-4.6` unless `XAI_MODEL` is set. Temperature for that path is 0.5.

Call sites that send market text:

- Trial narrative (`enhanceWithGrok`): ticker, windows, RSI, MACD, signal, model percents, and holding size and P&L if a holding was supplied. The account name is not in that prompt. It is only printed on the HTML.
- Ticker pane (`/api/ticker-analysis`): symbol, security name, and a Yahoo quote line. The builder is `tickerNoteCompletionMessages`, which the payload test checks for the account name and email.
- Portfolio analysis, chat, portfolio coach, and the Headmaster chat use the same pattern. The four checked builders do not interpolate `user.name` or `user.email`.

This work does not add a Grok call. A narrative model was not part of the measured check, so it is not treated as an accuracy upgrade. No account name is added to an outbound prompt.

## Data-quality bugs checked on 12 Oct 2026

A fresh Yahoo pull is in `docs/backtest/quote-check.json`.

RSG.AX was 1.145 versus a previous close of 1.12, about +2.23%. MAH.AX was 1.16 versus 1.11, about +4.51%. This pull did not show −25% or −32% as today's move. The spark `1d/5m` response had an empty bar list (`close: null`). The code then uses `fulldayPrice` and `chartPreviousClose`, which matched the vendor's own session percent on this pull.

The class of bug is still in the old code. `resolveSparkQuote` preferred the last 5-minute print over the official session price, and `reviewSessionMove` only withheld a disagreement with the previous close when the reported move also exceeded the session cap (50% for a name that is not on the large-cap list). A −25% or −32% print on RSG.AX or MAH.AX could therefore be published. The adjusted history does contain a RSG.AX session of −32.84% on 2024-11-10 (0.67 to 0.45). Volume was about 65 million and the price stayed down, so that day is a historical session, not a one-tick reversal. It is not "today".

ASX daily bars in the 5-year file and in the 5-day file both stopped at 2026-10-08, while the quote timestamp was 2026-10-12. The live print is ahead of the daily series.

BTC-USD on the same pull: the last hour of 5-minute bars was about −0.76%, and the last 12 bars were about −0.74% over 52 minutes. Those two agree. The mismatch that is in the code is elsewhere. The coin chart for a 1-day range from CoinPaprika is hourly. The detail view used to keep the last hour of timestamps and, when that window had fewer than two points, fall back to `prices.slice(-12)`. Twelve hourly bars are about twelve hours, labelled 1H. The 1-hour badge could then disagree with the feed's 1-hour percent.

## What the walk-forward check did

`src/lib/bot-eval.ts` reads `docs/backtest/closes.csv` (Yahoo adjusted daily closes, downloaded by `scripts/fetch-backtest-bars.mjs`). The basket is 10 NZX names, 12 ASX names (including RSG.AX and MAH.AX), 10 US names, and 10 coins (BTC, ETH, SOL, BNB, XRP, ADA, DOGE, AVAX, LINK, DOT).

Rules:

- A decision at close `t` sees only closes up to `t`. The outcome is close `t+7`.
- The first decision needs 60 prior closes. Steps are 7 sessions, so outcomes do not overlap.
- The engine is called with `calibrate: false`, so the check scores the raw model and applies any map itself.
- Fit dates are the earliest 40% of decision dates. Validation is the next 20%. Test dates start at 2024-10-24 and were not used to choose the map.
- A long is score ≥ 58 and a positive drift. Otherwise cash for that week.
- Round-trip cost is 6 bps (US, price ≥ 2), 16 bps (NZX/ASX, price ≥ 2), 50 bps (price under 2), or 30 bps (coins). Buy-and-hold on the same weeks pays no repeated cost.
- Hit rate ignores a week that moved less than 0.05%. Brier treats stated confidence as the probability the sign is right. Coverage is how often the base range contains the outcome. A 50% range should cover about half the weeks.
- Each decision row is hashed with the previous hash. The last hash is the seal in `docs/ai-bots-backtest.md`. The rows are `docs/ai-bots-decisions.csv`.

A unit check spikes the five closes after the decision and requires the drift, confidence, score, and band to stay the same.

## Before and after, test window only

| | Stox raw | Stox after the map | Koins raw | Koins after the map |
| --- | ---: | ---: | ---: | ---: |
| Decisions | 2,220 | 2,220 | 1,020 | 1,020 |
| Direction hit | 50.1% | 50.1% | 50.8% | 50.8% |
| Always-up baseline | 52.7% | 52.7% | 45.3% | 45.3% |
| 7-day momentum baseline | 47.8% | 47.8% | 46.7% | 46.7% |
| Brier (lower is better) | 0.298 | 0.250 | 0.317 | 0.250 |
| Base-range coverage | 51.6% | 49.6% | 52.1% | 50.4% |
| Mean week, long/cash after costs | −0.02% | −0.02% | +0.16% | +0.16% |
| Mean week, buy-and-hold | +0.42% | +0.42% | +0.42% | +0.42% |
| Max drawdown, strategy | −10.0% | −10.0% | −31.3% | −31.3% |
| Max drawdown, buy-and-hold | −20.4% | −20.4% | −72.1% | −72.1% |

A Brier score of 0.25 is what you get from always saying 50%. The raw scores were worse than that because confidence sat well above the hit rate. The fitted map is almost flat: higher raw confidence was not right more often. Stated confidence on a real equity history is now about 50%. The hit rate and the long/cash returns do not change, because the score thresholds were not changed.

The fit window did not beat the better naive baseline by 2 percentage points for either bot. Stox on the test window is still short of "always up". Koins on the test window is a few points above its baselines and still behind buy-and-hold after costs. That is not an edge this report will claim. A volume filter (only count longs on at least average volume) raised the Stox test hit rate to about 52.0%. It was not selected on the validation window, so it is not in the live path.

## What shipped

Kept, because the validation window preferred them and the test window agreed:

- The frozen map in `src/lib/bot-calibration.ts`. On a real equity history it replaces confidence and the base-range quartiles. The point forecast and the score are unchanged.
- Stox reports now pass Yahoo daily closes into the engine when at least 40 closes exist. If the tape is missing, the quote is older than five days, or the session percent is unconfirmed, the label is Hold. A missing tape is flattened, so a seeded walk is not published as RSI, MACD, or a 7-day range. A real history with a bad session print keeps that history and still refuses the buy or sell.
- Session percents. A last 5-minute tick more than 3% away from the official session price is dropped. A reported percent more than 3 points away from the prior daily close is replaced with the close-to-close change. `reviewSessionMove` withholds that disagreement even when the print is under the 50% cap.
- The 1-hour coin window uses timestamps. It does not fall back to 12 bars. If the spot would jump the last bar by more than 0.4%, the 1-hour badge keeps the feed's own 1-hour figure.

Not shipped:

- New BUY/SELL thresholds, a volume filter, or an ensemble. They did not beat the current score rule on a window that was not used to tune them.
- A Grok step inside the signal. It was not measured.
- Koins behaviour on the live site. `KOINS_MODEL_V2` must be `on` before crypto uses the daily-history map. It is off. `CRYPTO_PROJECTIONS_PAUSED` stays `true`.

The public summary is on the Trust page and in `src/lib/bot-scorecard.ts`.

## Round 2

The second check is `src/lib/bot-edge.ts`. It uses the same decisions and the same costs. Features at a decision use only closes up to that date. The middle window has to beat the current rule by more than 0.05 percentage points a week without a drawdown more than 5 points worse. A rule is kept only when the later window beats both the current rule and buy-and-hold, and the drawdown is not more than 5 points worse.

What was tested: cross-sectional momentum and reversal, an index gate (NZX 50, ASX 200, S&P 500), an NZD and AUD gate, EWMA and GARCH position sizing, a two-state hidden Markov regime on the S&P 500 for shares and on BTC for coins, a ridge model, a 20-stump ensemble, and meta-labelling. Coin context also included Bitcoin transaction counts from a public chart. BTC dominance was not available without a paid key, so it was not used. The free funding history that this environment could read starts in June 2026, inside the later window, so it was not used.

Nothing was kept. On shares, the stump ensemble was the middle-window winner and was still ahead of the old rule on the later window: about +0.23% a week versus −0.02%. Buy-and-hold on those same weeks was about +0.42%. The direction hit on the weeks it was long was 53.0%, against 52.7% for assuming every week finishes up. The drawdown widened from about −10% to about −19%. That is not an edge. On coins, relative strength led the middle window and then failed to beat the current rule on the later window. The 50% band was already within about a point of half, and the quantile variants were not closer on both windows.

The narrative layer now asks for one driver line at a time (driver, evidence, read) and withholds a reply that contains a price or a percent that was not in the supplied text. Holding size is not sent in that prompt. This was not scored as a return model. `KOINS_MODEL_V2` stays off.
