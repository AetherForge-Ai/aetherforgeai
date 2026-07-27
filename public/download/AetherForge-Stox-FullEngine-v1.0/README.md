# AetherForge Stox — Full Engine (Self-Hosted)

**Own it. Run it yourself.**

This package contains the **same technical-analysis engine** that powers Stox on the AetherForge AI website:

- RSI, MACD, SMA20/50, Bollinger structure
- Regime detection & conviction scoring
- 7-day probabilistic outlook (Base / Bull / Bear)
- Support / resistance / pivot levels
- Live prices + real daily history when available (Yahoo, keyless)
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
ticker,shares,avg_price
AIA.NZ,500,7.85
FPH.NZ,120,31.40
BHP.AX,150,42.10
AAPL,25,195.00
```

Generate the report:

```bash
npm run report
```

Open the HTML file that appears in the `output/` folder.

---

## Using another portfolio file

```bash
npm run report -- --portfolio ./path/to/my-holdings.csv
```

---

## What the full engine produces

For every holding:

| Section | Content |
|---------|---------|
| Signal | BUY / HOLD / SELL (website engine) |
| Performance | 1d / 7d / 30d moves |
| Technicals | RSI, MACD, vs SMA20, regime, score |
| Levels | Support, pivot, resistance |
| Outlook | Base / Bull / Bear scenarios with probabilities |
| Reasoning | Plain-English engine explanation |
| Position | Market value, cost, unrealised P&L |

When Yahoo returns enough daily history the report is marked **LIVE SERIES**. Otherwise it uses the same high-quality modelled series the website falls back to, anchored to the live price.

---

## Important

- This is **informational market analysis only**.
- It is **not** personalised financial advice.
- Always do your own research.
- Consider speaking with a licensed financial adviser before making investment decisions.

---

© Forge Intelligence Ltd · AetherForge AI  
www.aetherforgeai.co.nz
