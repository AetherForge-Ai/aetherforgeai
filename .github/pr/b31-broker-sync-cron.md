# b31: H-10 import hardening, G-10 optimistic Confirm, broker sync (IBKR Flex + XLSX), scheduled crons

## GOAL-LOCK / tickets
- **H-10** broker import (#449 rebased on develop 2cd71c78): row-level duplicates, 20/10 min write limit, CSV-formula strip, cent totals, cache invalidated on every exit.
- **G-10** optimistic write on Confirm (dialog held open until the server accepts; rollback on refusal).
- **BS-01** (GOAL-LOCK row 66) IBKR Flex Web Service sync (BROKER-SYNC-PLAN.md step 1, Lukas-approved). Acceptance criteria:
  - Read-only (SendRequest/GetStatement reports only), reconciling within NZ$0.01: cash rounded to cents, tested (`ibkr-sync.test.ts`).
  - Token server-side only: AES-256-GCM with `BROKER_TOKEN_KEY`, bound to the member id, never returned or logged (tested).
  - Clear errors: 1012 marks the connection expired and asks for a new token; 1013 explains the IP restriction and the fix (both tested).
  - IBKR rate limits respected: polls 2 s apart, at most 6 calls per sync; Sync now 6/h; cron runs members 7 s apart; own write bucket 12/h.
  - Invalid token: format checked, then one SendRequest on connect; a token IBKR refuses returns a clear error and saves nothing (tested, `bs01.test.ts`).
  - Fixture Flex statement (`src/lib/broker-sync/fixtures/ibkr-flex-statement.xml`) reconciles trades (NZ$-326.40) and cash (NZ$1,002.04) within NZ$0.01 (tested).
  - Cron route: 401 with no secret, a wrong secret or the old `?key=` form; 503 when CRON_SECRET is unset (tested). The workflow calls no email route.
  - No Math.random in broker-sync code (tested).
  - Disconnect deletes the row and its ciphertext.
  - Scheduled sync never duplicates: trades keyed `ref=ibkr-<TradeID>` + whole-file 409, cash keyed `ref=ibkrcash-<id>`; re-sync of the same statement writes 0 (tested).
- **H-10** broker sync step 2: XLSX import (Stake ASX + US tabs) on the H-10 framework; Hatch, Stake, CommSec, Swyftx, Easy Crypto, IBKR, ASB parsers confirmed.
- **G-20** track record: now scheduled every 6 h by `.github/workflows/cron.yml`; broker sync daily 16:00 UTC (05:00 NZDT). Headers only (`x-cron-secret`), no email routes.
- Privacy page: broker connections note (read-only, encrypted, revocable, offshore per IPP 12).
- IR3 helper: skipped (box mapping not certain).

## Reasoning
- Trades from IBKR go through the same H-10 commit path, so the b30 book-version bump, cache invalidation and duplicate checks apply unchanged; the IBKR trade id is the duplicate key.
- The token is decrypted only in the server sync worker, bound to the member id as additional data, never returned or logged; the app fails closed without the key or table.
- No cron trigger existed in the repo (wrangler has none), so GitHub Actions is the smallest change that schedules without altering the deploy.

## Confidence
- High for the import, crypto and routes (unit-tested; tsc, eslint, vitest, next and opennext builds pass).
- Medium for live IBKR behaviour: not exercised against a real Flex account. Dividend/cash conversion assumes an NZD IBKR base currency.
- Account deletion: no deletion path exists yet; the Privacy note says removal is handled on request.

## Expected impact
- Members holding IBKR get trades, dividends and cash into their book daily without uploads.
- Stake members can upload the XLSX report directly.
- The track record refreshes every 6 h once this reaches main.

## Before it works in production
- Executor creates the `broker_connection` table (user, broker, enc_token, query_id, last_sync, status, last_error).
- Set `BROKER_TOKEN_KEY` (32-byte base64) and `CRON_SECRET` in the app, and `CRON_SECRET` in GitHub Actions secrets (same value).
- Workflows run from main only, so scheduling starts after the mirror.
