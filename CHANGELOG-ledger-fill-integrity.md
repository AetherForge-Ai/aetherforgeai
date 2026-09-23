# Changelog — feature/ledger-fill-integrity

## What was wrong

- Crypto fills could be saved at absurd micro-prices (APT/UNI/ARB at ~0.0001–0.0006) with huge quantities, so NZD notionals “looked right” while qty×live was orders of magnitude off.
- Recommendations / bot signals could be treated like broker fills; realized P&L could appear without a user-confirmed fill.
- Prior session close could be booked on the next session (e.g. AVH.AX @ 2.79).
- Crypto Markets / buy live price / history often showed **unavailable** when CoinGecko 429’d or Swyftx sparkline subrequests failed the whole markets list.

## What we fixed

### Crypto live (required for live_spot)

- Cascade: Swyftx → CoinGecko → Yahoo major coins (`crypto-source.ts`, `crypto-yahoo.ts`).
- `/api/crypto/price` uses Swyftx spot + `fetchCryptoQuotes` before top-500 scan.
- Sparkline enrichment non-fatal; `SPARK_LIMIT` reduced for CF Worker safety.
- Canonical IDs: APT→aptos, UNI→uniswap, ARB→arbitrum, OP→optimism, SOL→solana.

### Phase 1 — Guards

- `checkFillSanity` on every holding save and filled trade (API + dialogs).
- 15% / 10× rules; crypto cash/qty implied check; no inflate-qty “fix”; NZD identity.
- Recommendations → idea/paper until “I filled this” with typed fill.
- Never copy mark/signal/prior-close onto fill unless user chooses that source.

### Phase 2 — Repair

- `/api/ledger/repair` + `LedgerRepairPanel`: flag crypto >3× and prior-close equities; known APT/UNI/ARB/AVH examples.
- Propose new_qty / new_price; **cash_nzd untouched**; originals in notes/audit.

### Phase 3 — Schema / export / P&L

- Extended ledger fields on writes; FIFO documented; price vs FX P&L split.
- CSV exact columns (FillCurrency, RealizedPricePnlNZD, RealizedFxPnlNZD, …).
- Feed mapping for listed tickers; `validate_ledger.mjs` exits non-zero on failure.
- In-app advisory: *AetherForge does not execute trades. Fill prices must match your broker.*

## Cash policy

**Cash left untouched** by repair jobs. Only explicit buy/sell/deposit/withdraw mutates cash.
