# Stox and Koins round-2 check

Same delayed public daily closes as the first check. Not a licensed or real-time NZX, ASX, or crypto feed.
Each feature uses only closes up to the decision date. The outcome is the close 7 sessions later. Decision weeks do not overlap.
The fit window ends at 2023-11-09. The later window starts at 2024-10-24. The later window was not used to choose a rule.
A long pays the same round-trip cost as the first check. Buy-and-hold on the same weeks pays no repeated cost.
Direction hit for a new rule counts only the weeks that rule is long. Always-up and momentum stay on every week in the window.

### Stox (NZX, ASX, US)

Before is the round-1 model on the later window: the sign from the daily engine, confidence mapped to about 50%, and the residual 50% band. A candidate is eligible when the middle window beats that model's weekly return by more than 0.05 percentage points without a drawdown more than 5 points worse. It is shipped only when the later window beats both that model and buy-and-hold, and the drawdown is not more than 5 points worse.

| Window | Decisions | Direction hit | Always-up | Momentum | Brier | 50% band coverage | Strategy mean % | Buy-and-hold mean % | Strategy max drawdown | Buy-and-hold max drawdown |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Before, later window | 2220 | 50.1% | 52.7% | 47.8% | 0.2500 | 49.6% | -0.024 | 0.425 | -9.98 | -20.37 |
| After, unchanged | 2220 | 50.1% | 52.7% | 47.8% | 0.2500 | 49.6% | -0.024 | 0.425 | -9.98 | -20.37 |
| Checked (stump ensemble), not shipped | 2220 | 53.0% | 52.7% | 47.8% | n/a | n/a | 0.228 | 0.425 | -19.05 | -20.37 |

No rule shipped.
The middle window preferred stump ensemble. The later weekly return still lagged buy-and-hold.

Middle-window gaps are the candidate weekly return minus the current rule. The later-window column is disclosed and was not used to pick the winner.

| Rule | Eligible | Validation gap (pp) | Validation mean % | Validation max drawdown | Later mean % | Later max drawdown |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| current | yes | 0 | 0.158 | -5.43 | -0.024 | -9.98 |
| basket relative strength | yes | 0.068 | 0.226 | -7.20 | 0.122 | -14.05 |
| within-market relative strength | yes | 0.080 | 0.238 | -7.20 | 0.112 | -14.31 |
| basket reversal | yes | -0.011 | 0.148 | -6.17 | 0.131 | -9.45 |
| strength after a short dip | yes | -0.100 | 0.059 | -2.32 | 0.057 | -4.85 |
| current rule when breadth is positive | yes | -0.012 | 0.146 | -4.39 | -0.008 | -10.01 |
| current rule when the index is up | yes | -0.010 | 0.149 | -4.06 | -0.033 | -10.52 |
| current rule when the local currency is up | yes | -0.038 | 0.120 | -3.74 | -0.046 | -10.42 |
| current rule sized by smoothed volatility | yes | -0.026 | 0.132 | -3.75 | -0.033 | -9.25 |
| current rule sized by GARCH volatility | yes | -0.029 | 0.130 | -4.17 | -0.028 | -9.63 |
| current rule in an up regime | yes | -0.006 | 0.152 | -5.30 | -0.038 | -9.58 |
| long in an up regime | yes | 0.270 | 0.428 | -14.39 | 0.143 | -13.03 |
| linear ensemble | yes | 0.017 | 0.175 | -7.25 | 0.365 | -16.75 |
| stump ensemble | yes | 0.194 | 0.353 | -6.01 | 0.228 | -19.05 |
| current rule only when fit probability clears | yes | -0.157 | 0.001 | -1.53 | -0.019 | -8.76 |
| current rule when transaction count is rising | no | n/a | n/a | n/a | n/a | n/a |

50% band coverage. A replacement must be at least 1 point closer to 50% on the middle window and still closer on the later window.

| Band | Middle-window coverage | Middle-window error | Later coverage | Later error |
| --- | ---: | ---: | ---: | ---: |
| current-residual | 49.9% | 0.001 | 49.5% | 0.005 |
| model-sigma | 49.9% | 0.001 | 49.5% | 0.005 |
| ewma-sigma | 49.8% | 0.002 | 49.9% | 0.001 |
| garch-sigma | 51.6% | 0.016 | 49.1% | 0.009 |
| vol-split | 50.3% | 0.003 | 50.0% | 0.000 |

No band shipped. The existing residual band stays.

### Koins (major coins)

Before is the round-1 model on the later window: the sign from the daily engine, confidence mapped to about 50%, and the residual 50% band. A candidate is eligible when the middle window beats that model's weekly return by more than 0.05 percentage points without a drawdown more than 5 points worse. It is shipped only when the later window beats both that model and buy-and-hold, and the drawdown is not more than 5 points worse.

| Window | Decisions | Direction hit | Always-up | Momentum | Brier | 50% band coverage | Strategy mean % | Buy-and-hold mean % | Strategy max drawdown | Buy-and-hold max drawdown |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Before, later window | 1020 | 50.8% | 45.3% | 46.7% | 0.2500 | 50.4% | 0.162 | 0.418 | -31.35 | -72.11 |
| After, unchanged | 1020 | 50.8% | 45.3% | 46.7% | 0.2500 | 50.4% | 0.162 | 0.418 | -31.35 | -72.11 |
| Checked (basket relative strength), not shipped | 1020 | 45.9% | 45.3% | 46.7% | n/a | n/a | 0.155 | 0.418 | -39.85 | -72.11 |

No rule shipped.
The middle window preferred basket relative strength. The later weekly return did not beat the current rule.

Middle-window gaps are the candidate weekly return minus the current rule. The later-window column is disclosed and was not used to pick the winner.

| Rule | Eligible | Validation gap (pp) | Validation mean % | Validation max drawdown | Later mean % | Later max drawdown |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| current | yes | 0 | -0.070 | -26.65 | 0.162 | -31.35 |
| basket relative strength | yes | 0.611 | 0.541 | -18.63 | 0.155 | -39.85 |
| within-market relative strength | yes | 0.611 | 0.541 | -18.63 | 0.155 | -39.85 |
| basket reversal | yes | -0.015 | -0.085 | -18.27 | -0.067 | -46.20 |
| strength after a short dip | yes | 0.149 | 0.079 | -10.23 | 0.087 | -26.27 |
| current rule when breadth is positive | yes | 0.054 | -0.016 | -24.97 | 0.161 | -32.35 |
| current rule when the index is up | no | n/a | n/a | n/a | n/a | n/a |
| current rule when the local currency is up | no | n/a | n/a | n/a | n/a | n/a |
| current rule sized by smoothed volatility | yes | -0.083 | -0.153 | -24.58 | 0.099 | -28.22 |
| current rule sized by GARCH volatility | yes | -0.067 | -0.137 | -25.47 | 0.099 | -28.14 |
| current rule in an up regime | yes | 0.039 | -0.031 | -2.02 | -0.015 | -1.53 |
| long in an up regime | yes | 0.252 | 0.182 | -5.87 | -0.132 | -14.12 |
| linear ensemble | yes | 0.405 | 0.335 | -19.02 | 0.061 | -37.39 |
| stump ensemble | yes | 0.100 | 0.029 | -18.02 | 0.290 | -30.67 |
| current rule only when fit probability clears | yes | -0.101 | -0.171 | -11.76 | -0.049 | -8.81 |
| current rule when transaction count is rising | yes | 0.351 | 0.281 | -8.38 | -0.126 | -28.35 |

50% band coverage. A replacement must be at least 1 point closer to 50% on the middle window and still closer on the later window.

| Band | Middle-window coverage | Middle-window error | Later coverage | Later error |
| --- | ---: | ---: | ---: | ---: |
| current-residual | 44.6% | 0.054 | 50.5% | 0.005 |
| model-sigma | 44.6% | 0.054 | 50.5% | 0.005 |
| ewma-sigma | 45.8% | 0.042 | 50.3% | 0.003 |
| garch-sigma | 43.8% | 0.062 | 52.8% | 0.028 |
| vol-split | 46.4% | 0.036 | 52.0% | 0.020 |

No band shipped. The existing residual band stays.

## Series that were and were not used

- ^NZ50 (index) 2021-10-12 to 2026-10-13, used. Delayed public series, not a licensed feed.
- ^AXJO (index) 2021-10-12 to 2026-10-13, used. Delayed public series, not a licensed feed.
- ^GSPC (index) 2021-10-13 to 2026-10-12, used. Delayed public series, not a licensed feed.
- NZDUSD=X (fx) 2021-10-12 to 2026-10-13, used. Delayed public series, not a licensed feed.
- AUDUSD=X (fx) 2021-10-12 to 2026-10-13, used. Delayed public series, not a licensed feed.
- BTC-TX (onchain) 2021-10-14 to 2026-10-12, used. Delayed public series, not a licensed feed.
- BTC-USDT-SWAP (funding) 2026-06-29 to 2026-10-13, not used. It does not cover the fit window, which ends 2023-11-09.
- BTC dominance history was not available from a free public chart in this environment, so it was not used. Coin rows use BTC's own 20-session return minus that coin's 20-session return instead. That is relative strength, not dominance.
- Binance funding history was not reachable from this environment (HTTP 451). OKX funding is kept only when it covers the fit window.

Cross-sectional ranks compare the basket on that decision date. Volatility sizing uses an EWMA or a GARCH(1,1) variance frozen from the fit window, then scaled so a typical week is fully invested and a louder week is smaller. The linear model and the stump ensemble predict the next 7-day percent from momentum, reversal, volume, breadth, and the context series above. The regime filter is a two-state hidden Markov model on the S&P 500 for shares and on BTC for coins. Meta-labelling keeps a current long only when a fit-window probability clears a threshold chosen on that same fit window.

This is a count of how these rules behaved on past delayed prices. It is not a forecast and it is not personal advice.
