# Can a longer horizon beat buy-and-hold?

The earlier studies asked whether the live 7-day score could call the sign of next week's return. It could not, once costs were charged. This note asks a different question, taken from the research that has actually survived a second look: at a one-month, three-month, or twelve-month horizon, with weekly or monthly rebalancing, does a long-only version of those rules beat buy-and-hold and the current score on a risk-adjusted basis after costs?

It does not, on this sample. Nothing was added to the live Stox or Koins bots. `KOINS_MODEL_V2` stays off. Crypto projections stay paused.

Stox: csmom-12-1-m had the highest validation Sharpe (1.73). Its validation deflated Sharpe is 0.62, which does not clear 0.95 after 18 trials. On the held-out window its Sharpe is 0.94, against buy-and-hold 0.63 and the current score rule 1.00. It does not ship.

Koins: csmom-21-m had the highest validation Sharpe (0.96). Its validation deflated Sharpe is 0.55, which does not clear 0.95 after 18 trials. On the held-out window its Sharpe is 0.13, ahead of buy-and-hold 0.11 and the current score rule -0.07. It does not ship.

## Sources

These are the papers the rules come from. The numbers below are our own. Where a paper reports a Sharpe, that Sharpe is about the paper's market and sample, not about this file.

- **Time-series momentum.** Moskowitz, Ooi, and Pedersen, "Time series momentum," *Journal of Financial Economics* 104 (2012). The past 12-month return of a futures contract points the same way as the next month. They scale each position by its own volatility. A diversified long-short book of those positions had a Sharpe above 1 in their sample, with little correlation to the underlying markets. Hurst, Ooi, and Pedersen, "A Century of Evidence on Trend-Following Investing," *Journal of Portfolio Management* (2017), run the same idea, volatility-scaled, across a much longer futures history and still find a positive trend premium.
- **12-1 cross-sectional momentum.** Jegadeesh and Titman, "Returns to Buying Winners and Selling Losers," *Journal of Finance* 48 (1993), show that stocks which led their peers over 3 to 12 months tend to keep leading for the next few months. The version that skips the most recent month, the 12-1 return used in the Ken French momentum factor and in Carhart, "On Persistence in Mutual Fund Performance," *Journal of Finance* 52 (1997), is the one that avoids the short-term reversal below.
- **Low volatility.** Ang, Hodrick, Xing, and Zhang, "The Cross-Section of Volatility and Expected Returns," *Journal of Finance* 61 (2006), find that high recent volatility predicts low subsequent return. Frazzini and Pedersen, "Betting Against Beta," *Journal of Financial Economics* 111 (2014), find the same shape in beta. The rule tested here is the simple one: hold the third of the book with the lowest realised volatility. It is not a beta-neutral book.
- **Short-term reversal.** Jegadeesh, "Evidence of Predictable Behavior of Security Returns," *Journal of Finance* 45 (1990), documents a one-month reversal. Lehmann, "Fads, Martingales, and Market Efficiency," *Quarterly Journal of Economics* 105 (1990), documents a one-week reversal. Both are expensive to trade. They are included because they are the reason the 12-1 momentum factor skips a month, and because the 7-day horizon in the earlier studies sits inside this window.
- **Post-earnings drift.** Ball and Brown, *Journal of Accounting Research* (1968), and Bernard and Thomas, "Post-Earnings-Announcement Drift," *Journal of Accounting Research* 27 (1989), find that prices keep moving in the direction of an earnings surprise. Using it requires the surprise as it was known on the announcement day. Yahoo's current earnings pages are the latest view of those figures, not a point-in-time archive. No free point-in-time surprise file was available, so post-earnings drift was not tested. No earnings numbers were invented to fill the gap.
- **Crypto trend.** Liu and Tsyvinski, "Risks and Returns of Cryptocurrency," *Review of Financial Studies* 34 (2021), find a strong time-series momentum effect in coins. Liu, Tsyvinski, and Wu, NBER Working Paper 25882 (2019), build a crypto momentum factor from one-week to four-week returns. The test here asks whether that idea, and the longer Moskowitz horizons, still help after costs on the coins Yahoo actually publishes.
- **Multiple testing.** Bailey and López de Prado, "The Deflated Sharpe Ratio: Correcting for Selection Bias, Backtest Overfitting, and Non-Normality," *Journal of Portfolio Management* 40 (2014). Trying 18 rules inflates the best Sharpe even when every rule is noise. The deflated Sharpe is the probability that the selected rule's true Sharpe beats the Sharpe you would expect to find by taking the best of 18 noise trials, after a penalty for skew and fat tails. A value above 0.95 is the usual bar. The trials are correlated, so treating them as 18 independent tries is the harsher reading, and that is the reading used here.

## What was tested

Eighteen rules, chosen before the held-out numbers were read. Each book, Stox and Koins, is searched separately, so the penalty is 18 per book rather than 36.

| Family | What it holds | Horizons | Rebalance |
| --- | --- | --- | --- |
| Time-series momentum | Names with a positive own return, weighted by 10% divided by their 3-month volatility, with the book capped at 100% and the rest left in cash | 1, 3, and 12 months | weekly and monthly |
| Cross-sectional momentum | The top third by own return. The 12-month version skips the most recent month (12-1). Equal weight | 1, 3, and 12-1 months | weekly and monthly |
| Low volatility | The third with the lowest realised volatility. Equal weight, fully invested | 3-month and 12-month volatility | weekly and monthly |
| Short-term reversal | The worst third over the past week, rebalanced weekly, and the worst third over the past month, rebalanced monthly | 1 week and 1 month | matching the horizon |

A name is eligible on a date only if it has a price within the last 7 days. A coin that listed in 2023 does not appear in 2021. Lookbacks use that name's own history, so a 12-month signal stays blank until the name has 12 months of closes. Signals use prices up to the decision date. The return is the move from that date to the next rebalance. Weights never depend on a later close.

The published versions of these rules are long-short, and the futures versions use leverage to hit a volatility target. These bots do not short and do not borrow. Every rule here is the long leg only. Time-series momentum holds cash when few names are in an uptrend. The other rules stay fully invested in their third of the book.

Costs use the same one-way schedule as the earlier studies: 3 bps in the US, 8 bps on NZX and ASX names priced at $2 or more, 25 bps below $2, and 15 bps in crypto. They are charged on turnover. A position that is kept is not charged a fresh round trip. Cash earns the US 13-week T-bill yield from Yahoo `^IRX`, pro-rated by the length of the holding period. Sharpe and Sortino use the return minus that T-bill rate. Annualised return, volatility, and max drawdown use the portfolio's own value, so a drawdown is a drawdown in the account rather than a drawdown versus bills. The risk-free rate is a US yield applied to a book that also holds NZD and AUD shares. That is a common yardstick, not a perfect local cash rate.

Buy-and-hold is restarted, equal weight, at the first date of each window, among the names tradable that day, and then left alone. The current score rule is the live one: a name is held when `analyzeSecurity` gives it a score of 58 or more, which is the Buy threshold in `signalFromScore`. Those names are equal-weighted and the rest is cash. The score is computed from closes up to the decision date only.

The validation window is every decision before 24 October 2024, after a 252-session burn-in so the 12-month signal exists. The held-out window is every decision on or after 24 October 2024. The winner is the rule with the highest validation Sharpe. Its deflated Sharpe is computed on the validation returns. The held-out window is then read once. A rule ships only if all of these are true:

- validation deflated Sharpe above 0.95
- held-out Sharpe above buy-and-hold and above the current score rule, on the same rebalance grid
- held-out max drawdown no more than 10 points worse than buy-and-hold

Separately, a rule that keeps a validation Sharpe within 0.05 of buy-and-hold and cuts the validation max drawdown by at least 5 points is reported as a drawdown saver. That report does not, by itself, ship the rule.

## Universe

Daily adjusted closes from Yahoo, the same source as the earlier studies. 140 names from 2021-10-12 to 2026-10-13: 41 NZX, 40 ASX, 10 US stocks, 16 US and regional ETFs (SPY, QQQ, IWM, EWA, ENZL, and the SPDR sector funds), and 33 coin files. Four NZX tickers Yahoo does not list (GMT, PPH, FRE, ARV) were left out. Uniswap, Aptos, and Sui are included under Yahoo's long tickers `UNI7083-USD`, `APT21794-USD`, and `SUI20947-USD`, because the short tickers returned nothing. Aptos and Sui do not cover the full five years, and they enter only once their own history is long enough.

A downloaded series is dropped if, after removing an isolated print that is at least five times both neighbouring closes, any remaining one-day move is larger than 200% or worse than -90%. That rule removed ARB-USD, OP-USD, TON-USD. ARB-USD, OP-USD, and TON-USD jump between a fraction of a cent and a dollar and stay at the new level, so they are not a tradable history. Render, Fetch, and Maker (`RENDER-USD`, `FET-USD`, `MKR-USD`) are in the file in their place and pass the same check. The first Koins pass, before this rule, showed annualised volatility in the thousands of percent. That figure was the bad prints, not a market. The ship bar was not changed for the rerun. No row was filled in by hand.

## Stox

107 names in the file, 107 with enough history to enter the book. The book mixes single stocks and ETFs, so a cross-sectional rank can prefer a sector fund to a stock. Time-series momentum does not need that comparison.

csmom-12-1-m had the highest validation Sharpe (1.73). Its validation deflated Sharpe is 0.62, which does not clear 0.95 after 18 trials. On the held-out window its Sharpe is 0.94, against buy-and-hold 0.63 and the current score rule 1.00. It does not ship.

No rule cut the validation max drawdown by at least 5 points while keeping a validation Sharpe within 0.05 of buy-and-hold.

| Rule | Window | N | Ann. return | Vol | Sharpe | Sortino | Max DD | Invested | DSR |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Buy and hold (weekly) | validation | 104 | 20.4% | 9.2% | 1.52 | 2.37 | -7.4% | 100.0% | — |
| Buy and hold (weekly) | held out | 98 | 9.7% | 9.8% | 0.59 | 0.84 | -12.5% | 100.0% | — |
| Current score ≥ 58 (weekly) | validation | 104 | 8.4% | 9.9% | 0.37 | 0.51 | -10.6% | 100.0% | — |
| Current score ≥ 58 (weekly) | held out | 98 | 1.8% | 11.6% | -0.13 | -0.18 | -10.7% | 100.0% | — |
| Buy and hold (monthly) | validation | 25 | 19.5% | 8.3% | 1.60 | 3.25 | -3.6% | 100.0% | — |
| Buy and hold (monthly) | held out | 23 | 10.6% | 10.6% | 0.63 | 0.95 | -11.7% | 100.0% | — |
| Current score ≥ 58 (monthly) | validation | 25 | 11.6% | 10.1% | 0.65 | 0.98 | -7.6% | 100.0% | — |
| Current score ≥ 58 (monthly) | held out | 23 | 13.9% | 9.6% | 1.00 | 2.01 | -8.4% | 100.0% | — |
| tsmom-21-w | validation | 104 | 11.6% | 7.8% | 0.81 | 1.15 | -9.1% | 100.0% | 0.14 |
| tsmom-21-w | held out | 98 | 6.7% | 8.9% | 0.33 | 0.44 | -11.2% | 100.0% | 0.02 |
| tsmom-63-w | validation | 104 | 11.9% | 7.6% | 0.87 | 1.26 | -7.0% | 100.0% | 0.17 |
| tsmom-63-w | held out | 98 | 8.5% | 8.7% | 0.52 | 0.72 | -10.3% | 100.0% | 0.05 |
| tsmom-252-w | validation | 104 | 17.9% | 7.9% | 1.50 | 2.31 | -5.3% | 99.0% | 0.55 |
| tsmom-252-w | held out | 98 | 9.9% | 9.2% | 0.65 | 0.92 | -11.1% | 100.0% | 0.08 |
| tsmom-21-m | validation | 25 | 15.1% | 9.1% | 1.05 | 1.95 | -5.7% | 100.0% | 0.28 |
| tsmom-21-m | held out | 23 | 10.0% | 9.5% | 0.64 | 0.94 | -13.1% | 100.0% | 0.07 |
| tsmom-63-m | validation | 25 | 13.8% | 7.6% | 1.09 | 2.11 | -3.9% | 100.0% | 0.32 |
| tsmom-63-m | held out | 23 | 10.5% | 9.3% | 0.70 | 1.15 | -9.5% | 100.0% | 0.09 |
| tsmom-252-m | validation | 25 | 12.9% | 7.1% | 1.06 | 2.02 | -3.4% | 96.0% | 0.30 |
| tsmom-252-m | held out | 23 | 11.4% | 10.3% | 0.72 | 1.14 | -10.7% | 100.0% | 0.09 |
| csmom-21-w | validation | 104 | 10.8% | 9.8% | 0.59 | 0.87 | -12.3% | 100.0% | 0.07 |
| csmom-21-w | held out | 98 | 7.1% | 10.8% | 0.32 | 0.44 | -10.8% | 100.0% | 0.02 |
| csmom-63-w | validation | 104 | 18.2% | 9.5% | 1.28 | 2.04 | -7.4% | 100.0% | 0.46 |
| csmom-63-w | held out | 98 | 12.3% | 10.2% | 0.80 | 1.09 | -11.2% | 100.0% | 0.13 |
| csmom-12-1-w | validation | 104 | 23.2% | 9.8% | 1.67 | 2.66 | -6.4% | 99.0% | 0.68 |
| csmom-12-1-w | held out | 98 | 13.7% | 11.3% | 0.84 | 1.22 | -14.7% | 100.0% | 0.15 |
| csmom-21-m | validation | 25 | 17.6% | 10.1% | 1.17 | 2.20 | -5.0% | 100.0% | 0.35 |
| csmom-21-m | held out | 23 | 14.5% | 11.3% | 0.91 | 1.53 | -14.3% | 100.0% | 0.17 |
| csmom-63-m | validation | 25 | 18.6% | 9.8% | 1.30 | 2.54 | -4.3% | 100.0% | 0.46 |
| csmom-63-m | held out | 23 | 12.6% | 11.8% | 0.74 | 1.20 | -11.5% | 100.0% | 0.10 |
| csmom-12-1-m · selected | validation | 25 | 20.7% | 8.3% | 1.73 | 3.27 | -3.8% | 96.0% | 0.62 |
| csmom-12-1-m · selected | held out | 23 | 14.7% | 11.2% | 0.94 | 1.52 | -10.9% | 100.0% | 0.16 |
| lowvol-63-w | validation | 104 | 10.9% | 7.7% | 0.74 | 1.07 | -7.9% | 100.0% | 0.12 |
| lowvol-63-w | held out | 98 | 6.2% | 9.1% | 0.28 | 0.38 | -10.1% | 100.0% | 0.02 |
| lowvol-252-w | validation | 104 | 12.5% | 7.9% | 0.91 | 1.40 | -7.2% | 99.0% | 0.21 |
| lowvol-252-w | held out | 98 | 8.8% | 9.4% | 0.53 | 0.74 | -9.9% | 100.0% | 0.05 |
| lowvol-63-m | validation | 25 | 10.6% | 7.2% | 0.76 | 1.32 | -3.8% | 100.0% | 0.13 |
| lowvol-63-m | held out | 23 | 8.4% | 10.7% | 0.44 | 0.69 | -11.3% | 100.0% | 0.04 |
| lowvol-252-m | validation | 25 | 9.3% | 7.5% | 0.58 | 0.96 | -4.0% | 96.0% | 0.07 |
| lowvol-252-m | held out | 23 | 9.0% | 10.7% | 0.49 | 0.82 | -10.1% | 100.0% | 0.05 |
| reversal-5-w | validation | 104 | 14.0% | 10.4% | 0.83 | 1.31 | -8.5% | 100.0% | 0.17 |
| reversal-5-w | held out | 98 | 10.6% | 13.9% | 0.51 | 0.76 | -17.9% | 100.0% | 0.05 |
| reversal-21-m | validation | 25 | 12.8% | 9.1% | 0.83 | 1.69 | -4.0% | 100.0% | 0.19 |
| reversal-21-m | held out | 23 | 4.6% | 13.8% | 0.11 | 0.16 | -11.4% | 100.0% | 0.01 |

## Koins

30 coins. The same 18 rules. A Koins rule that cleared the bar would still not be switched on for members: `KOINS_MODEL_V2` stays off.

csmom-21-m had the highest validation Sharpe (0.96). Its validation deflated Sharpe is 0.55, which does not clear 0.95 after 18 trials. On the held-out window its Sharpe is 0.13, ahead of buy-and-hold 0.11 and the current score rule -0.07. It does not ship.

lowvol-252-m is the validation drawdown saver: validation Sharpe 0.81 versus buy-and-hold 0.71, validation max drawdown -34.2% versus -57.1%. Held out, its Sharpe is 0.34 versus buy-and-hold 0.11, and its max drawdown is -57.0% versus -71.3%. A drawdown saver is reported even when it does not clear the ship bar.

| Rule | Window | N | Ann. return | Vol | Sharpe | Sortino | Max DD | Invested | DSR |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Buy and hold (weekly) | validation | 171 | 39.5% | 61.3% | 0.78 | 1.17 | -58.0% | 100.0% | — |
| Buy and hold (weekly) | held out | 143 | -4.8% | 53.4% | 0.09 | 0.15 | -73.6% | 100.0% | — |
| Current score ≥ 58 (weekly) | validation | 171 | 15.4% | 62.0% | 0.48 | 0.69 | -68.4% | 97.7% | — |
| Current score ≥ 58 (weekly) | held out | 143 | -25.3% | 61.2% | -0.25 | -0.39 | -89.6% | 98.6% | — |
| Buy and hold (monthly) | validation | 41 | 39.0% | 68.6% | 0.71 | 1.60 | -57.1% | 100.0% | — |
| Buy and hold (monthly) | held out | 33 | -5.1% | 59.0% | 0.11 | 0.19 | -71.3% | 100.0% | — |
| Current score ≥ 58 (monthly) | validation | 41 | 42.4% | 79.7% | 0.70 | 1.80 | -52.1% | 100.0% | — |
| Current score ≥ 58 (monthly) | held out | 33 | -14.8% | 58.2% | -0.07 | -0.11 | -79.2% | 93.9% | — |
| tsmom-21-w | validation | 171 | 18.1% | 45.5% | 0.50 | 0.69 | -56.8% | 81.1% | 0.09 |
| tsmom-21-w | held out | 143 | 8.9% | 45.5% | 0.32 | 0.52 | -60.5% | 79.5% | 0.03 |
| tsmom-63-w | validation | 171 | 14.1% | 44.6% | 0.42 | 0.59 | -48.3% | 83.8% | 0.06 |
| tsmom-63-w | held out | 143 | 1.2% | 42.2% | 0.14 | 0.22 | -68.5% | 71.7% | 0.01 |
| tsmom-252-w | validation | 171 | 33.8% | 40.7% | 0.81 | 1.26 | -47.0% | 76.8% | 0.29 |
| tsmom-252-w | held out | 143 | 8.1% | 41.7% | 0.29 | 0.50 | -50.5% | 83.8% | 0.03 |
| tsmom-21-m | validation | 41 | 33.4% | 52.6% | 0.70 | 1.49 | -52.8% | 81.4% | 0.26 |
| tsmom-21-m | held out | 33 | -8.2% | 51.7% | -0.01 | -0.01 | -70.6% | 78.4% | 0.00 |
| tsmom-63-m | validation | 41 | 27.7% | 49.7% | 0.62 | 1.41 | -46.0% | 81.2% | 0.21 |
| tsmom-63-m | held out | 33 | 24.1% | 46.5% | 0.59 | 1.23 | -36.1% | 70.9% | 0.13 |
| tsmom-252-m | validation | 41 | 34.4% | 48.2% | 0.74 | 1.58 | -47.0% | 76.9% | 0.31 |
| tsmom-252-m | held out | 33 | 11.2% | 46.9% | 0.35 | 0.69 | -43.2% | 81.9% | 0.04 |
| csmom-21-w | validation | 171 | 43.4% | 57.7% | 0.84 | 1.26 | -54.1% | 100.0% | 0.31 |
| csmom-21-w | held out | 143 | 1.7% | 57.9% | 0.24 | 0.39 | -69.4% | 100.0% | 0.02 |
| csmom-63-w | validation | 171 | 43.8% | 58.9% | 0.84 | 1.29 | -47.8% | 100.0% | 0.31 |
| csmom-63-w | held out | 143 | -8.4% | 56.0% | 0.04 | 0.07 | -78.3% | 100.0% | 0.01 |
| csmom-12-1-w | validation | 171 | 26.5% | 55.5% | 0.62 | 0.92 | -58.2% | 100.0% | 0.15 |
| csmom-12-1-w | held out | 143 | 4.8% | 50.9% | 0.26 | 0.42 | -65.9% | 100.0% | 0.02 |
| csmom-21-m · selected | validation | 41 | 59.2% | 61.9% | 0.96 | 2.24 | -50.1% | 100.0% | 0.55 |
| csmom-21-m · selected | held out | 33 | -5.1% | 63.4% | 0.13 | 0.24 | -70.7% | 100.0% | 0.01 |
| csmom-63-m | validation | 41 | 50.1% | 63.5% | 0.84 | 2.08 | -41.0% | 100.0% | 0.46 |
| csmom-63-m | held out | 33 | -6.0% | 57.3% | 0.08 | 0.14 | -72.0% | 100.0% | 0.01 |
| csmom-12-1-m | validation | 41 | 33.8% | 55.7% | 0.70 | 1.34 | -51.1% | 100.0% | 0.24 |
| csmom-12-1-m | held out | 33 | -2.8% | 49.6% | 0.09 | 0.16 | -64.0% | 100.0% | 0.01 |
| lowvol-63-w | validation | 171 | 26.7% | 43.2% | 0.66 | 0.96 | -41.1% | 100.0% | 0.17 |
| lowvol-63-w | held out | 143 | 1.6% | 46.8% | 0.18 | 0.28 | -67.5% | 100.0% | 0.01 |
| lowvol-252-w | validation | 171 | 35.8% | 43.8% | 0.82 | 1.20 | -38.9% | 100.0% | 0.28 |
| lowvol-252-w | held out | 143 | 9.8% | 49.2% | 0.35 | 0.57 | -62.9% | 100.0% | 0.04 |
| lowvol-63-m | validation | 41 | 31.6% | 46.0% | 0.71 | 1.49 | -38.9% | 100.0% | 0.26 |
| lowvol-63-m | held out | 33 | 0.3% | 54.7% | 0.18 | 0.31 | -64.9% | 100.0% | 0.01 |
| lowvol-252-m | validation | 41 | 38.8% | 47.9% | 0.81 | 1.79 | -34.2% | 100.0% | 0.38 |
| lowvol-252-m | held out | 33 | 10.1% | 55.2% | 0.34 | 0.67 | -57.0% | 100.0% | 0.04 |
| reversal-5-w | validation | 171 | 11.8% | 55.5% | 0.40 | 0.57 | -55.8% | 100.0% | 0.06 |
| reversal-5-w | held out | 143 | -21.0% | 60.0% | -0.17 | -0.25 | -83.9% | 100.0% | 0.00 |
| reversal-21-m | validation | 41 | 11.5% | 62.4% | 0.38 | 0.71 | -53.1% | 100.0% | 0.06 |
| reversal-21-m | held out | 33 | -6.0% | 66.3% | 0.14 | 0.25 | -75.1% | 100.0% | 0.01 |

## What this means for the bots

The live score is a 7-day indicator blend. The research that has held up out of sample lives at a monthly horizon, usually in a long-short or leveraged futures book, and it does not automatically transfer to a long-only book of NZ, Australian, US, and crypto names over a two-year holdout. Where a rule looks better on the raw held-out Sharpe, the validation deflated Sharpe is the check on whether that was the best of 18 tries. The tables above are the whole search.

No live threshold, prompt, or model flag changed with this study. The held-out column was not used to pick the winner.
