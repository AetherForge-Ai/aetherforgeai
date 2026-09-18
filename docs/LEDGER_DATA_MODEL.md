# AetherForge Ledger Data Model

**Timezone:** Pacific/Auckland for `trade_datetime` / CSV `DateTime_NZ`.

## Holdings / transactions fields

| Field | Meaning |
|-------|---------|
| ticker | Symbol (APT, AVH.AX, PFI.NZ, …) |
| instrument_type | equity \| crypto \| metal \| cash |
| venue | NZX \| ASX \| US \| CRYPTO \| METALS |
| asset_id | Canonical feed id (aptos, AVH.AX, …) |
| quantity | Units |
| fill_price | Broker fill (immutable after confirm unless user edits) |
| fill_currency | NZD \| AUD \| USD |
| signal_price | Bot/signal (never auto-copied to fill) |
| mark_price | Live mark for **unrealized** only |
| price_source | user_fill \| broker_import \| session_close \| live_quote \| bot_signal |
| price_as_at | When price was observed |
| trade_datetime | Pacific/Auckland stamp |
| execution_status | idea \| paper \| filled |
| order_sizing | units \| notional |
| notional_native / native_notional | qty × fill in native ccy |
| fees_native / fees_nzd | Fees |
| fx_rate / fx_timestamp / fx_source | Persisted FX at trade time |
| cash_nzd | Cash impact — **never auto-changed by repair** |
| realized_price_pnl_nzd | FIFO price P&L in NZD |
| realized_fx_pnl_nzd | FIFO FX P&L in NZD |
| realized_pnl_nzd | price + fx |
| broker / notes | Broker name + audit trail |

## Rules

- Stox / Koins / Headmaster suggestions → `idea` or `paper` only (no realized P&L).
- Filled CSV rows = `execution_status=filled`.
- `mark_price` never creates realized P&L.
- `session_close` ⇒ trade_date must be that session (never D-1 close on D buy unless user chooses previous close).

## FIFO

Buys open lots `{qty, fill_price, fill_currency, fx_rate, trade_datetime}`.
Sells close oldest lots first. See `fifoApplySell` in `src/lib/ledger-schema.ts`.

## Migration / backfill

Optional fields on Totalum `stock` / `transaction` documents. Run app once; new writes populate fields.
Legacy rows: `backfillTradeDefaults()` treats missing `execution_status` as `filled`, `price_source` as `user_fill`, and maps `realized_pnl` → `realized_price_pnl_nzd` with `realized_fx_pnl_nzd=0`.
**Repair never mutates cash_nzd.**

## Sanity

See `src/lib/fill-integrity.ts` — 15% soft, 10× hard (type live to override), crypto implied price, NZD identity.
