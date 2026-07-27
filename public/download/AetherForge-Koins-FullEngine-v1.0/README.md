# AetherForge Koins — Full Engine (Self-Hosted)

**Own it. Run it yourself.**

This package contains the **same technical-analysis engine** that powers Koins on the AetherForge AI website, configured for digital assets:

- RSI, MACD, SMA20/50, Bollinger structure
- Regime detection & conviction scoring (crypto volatility scaling)
- 7-day probabilistic outlook (Base / Bull / Bear)
- Support / resistance / pivot levels
- Live prices via Yahoo Finance + CoinGecko fallback (keyless)
- Real daily history when available
- Full HTML intelligence report

No subscription. No login. You control the data and the machine.

---

## Requirements

- **Node.js 18+** → [https://nodejs.org](https://nodejs.org) (LTS recommended)

No API keys required for live prices.

---

## Quick start

```bash
npm install
```

Edit `portfolio.csv`:

```csv
symbol,quantity,avg_price
BTC,0.15,68500
ETH,2.5,3400
SOL,45,145
XRP,2500,0.55
```

Generate the report:

```bash
npm run report
```

Open the HTML file that appears in the `output/` folder.

---

## Using another portfolio file

```bash
npm run report -- --portfolio ./path/to/my-crypto.csv
```

---

## Supported symbols

Major coins work out of the box (BTC, ETH, SOL, BNB, XRP, ADA, AVAX, DOGE, LINK, DOT, MATIC, LTC, UNI, ATOM, NEAR, APT, ARB, OP, and more).

Use the plain ticker (e.g. `BTC`), not exchange-specific pairs.

---

## What the full engine produces

For every holding:

| Section | Content |
|---------|---------|
| Signal | Strong Buy / Buy / Hold / Reduce / Sell |
| Performance | 1d / 7d / 30d moves |
| Technicals | RSI, MACD, vs SMA20, regime, score |
| Levels | Support, pivot, resistance |
| Outlook | Base / Bull / Bear scenarios with probabilities |
| Reasoning | Plain-English engine explanation |
| Position | Market value (USD), cost, unrealised P&L |

When enough real history is available the report is marked **LIVE SERIES**.

---

## Important

- Crypto markets are highly volatile and trade 24/7.
- This is **informational market analysis only**.
- It is **not** personalised financial advice.
- Always do your own research.
- Consider speaking with a licensed financial adviser before making investment decisions.

---

© Forge Intelligence Ltd · AetherForge AI  
www.aetherforgeai.co.nz
