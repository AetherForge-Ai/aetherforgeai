# Stox and Koins walk-forward check

Delayed public daily closes from Yahoo Finance. Not a licensed or real-time NZX, ASX, or crypto feed.
Each decision uses only closes up to that date. The outcome is the close 7 sessions later. Decisions do not overlap.
The fit window is the earliest 40% of decision dates. The validation window is the next 20%. The test window is the last 40%. The test window was not used to choose the calibration.
A long is taken when the score is at least 58 and the 7-day drift is positive. Otherwise the strategy is in cash for that week.
Round-trip cost is 6 bps for a US name at or above 2, 16 bps for an NZX or ASX name at or above 2, 50 bps for a name under 2, and 30 bps for a coin. Buy-and-hold is the same weeks with no repeated cost.
Hit rate ignores weeks where the outcome moved less than 0.05%. Brier scores the stated confidence as the probability that the sign is right. The 50% band should contain the outcome about half the time.

The validation window preferred recalibrated confidence and a residual 50% band. Those coefficients are frozen in the real-history engine for equities. Koins uses them only when KOINS_MODEL_V2=on, which is off.

Fit through (test dates start at) 2024-10-24. Rows 7962. Seal f8181abfa5d71fe9fd9e8e66ed38d13169310755895744954dbab5f4ad1cfe19.

### Stox (NZX, ASX, US)

On the fit window the directional call did not beat the better naive baseline by 2 percentage points. That is a no-edge result for the fit window.
On the later test window the raw directional call also did not beat that baseline by 2 percentage points.

| Window | Decisions | Direction hit | Always-up | Momentum | Brier | 50% band coverage | Strategy mean % | Buy-and-hold mean % | Strategy max drawdown | Buy-and-hold max drawdown |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Fit (raw) | 2124 | 49.9% | 51.3% | 49.7% | 0.3039 | 52.3% | 0.028 | 0.112 | -11.96 | -40.95 |
| Validation (raw) | 1098 | 52.1% | 57.2% | 50.3% | 0.2940 | 51.4% | 0.158 | 0.677 | -5.43 | -9.23 |
| Test, raw model | 2220 | 50.1% | 52.7% | 47.8% | 0.2982 | 51.6% | -0.024 | 0.425 | -9.98 | -20.37 |
| Test, after the frozen map | 2220 | 50.1% | 52.7% | 47.8% | 0.2500 | 49.6% | -0.024 | 0.425 | -9.98 | -20.37 |

Volume filter (test longs with volume at or above the 20-session average): hit rate 52.0%.

### Koins (major coins)

On the fit window the directional call did not beat the better naive baseline by 2 percentage points. That is a no-edge result for the fit window.
On the later test window the raw directional call beat that baseline by more than 2 percentage points.

| Window | Decisions | Direction hit | Always-up | Momentum | Brier | 50% band coverage | Strategy mean % | Buy-and-hold mean % | Strategy max drawdown | Buy-and-hold max drawdown |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Fit (raw) | 1000 | 50.6% | 45.7% | 50.9% | 0.3155 | 52.4% | -0.072 | -0.164 | -28.71 | -75.86 |
| Validation (raw) | 500 | 46.3% | 49.3% | 47.2% | 0.3348 | 49.8% | -0.070 | 1.029 | -26.65 | -39.09 |
| Test, raw model | 1020 | 50.8% | 45.3% | 46.7% | 0.3174 | 52.1% | 0.162 | 0.418 | -31.35 | -72.11 |
| Test, after the frozen map | 1020 | 50.8% | 45.3% | 46.7% | 0.2500 | 50.4% | 0.162 | 0.418 | -31.35 | -72.11 |

Volume filter (test longs with volume at or above the 20-session average): hit rate 51.6%.


This is a count of how a model behaved on past delayed prices. It is not a forecast and it is not personal advice.
