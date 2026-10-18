# b31: P1 REG-1 fix (b30 snapshot stalls), H-1, M-2, G-05, CR-2, G-10; H-10 import hardening; BS-01 IBKR Flex sync; XLSX import

## GOAL-LOCK / tickets

### P1 production regression from b30 (fixed first)
- **REG-1** (b30-public.md): /markets, coin pages and /api/ticker stalled 25–45 s (one 524). Cause: the b30 H-1 snapshot code awaited the store on the render path (re-read before render every 3 s, compare-and-set read + chunked writes inside the request, 2.5 s DB waits, an 8 s in-request upgrade, an FX fetch with no timeout).
  - Every store read in render/API paths has a hard 1.5 s cap (`STORE_HARD_TIMEOUT_MS`); with a last-good copy in memory a request never waits on the store (re-read runs in the background via waitUntil).
  - Versioned compare-and-set writes run in the background (waitUntil); `persistCryptoSnapshot` returns at once and this isolate serves the new list.
  - In-request refreshes wait at most 1.2 s (were 1.5–8 s, plus attempt flushes); FX fetch aborts at 1.5 s; tape parts cap at 1.5 s with last-good fallback; /api/ticker skips the session lookup unless a test cookie is present.
  - **Proof (local load test, injected slow store: every Totalum call hangs 30 s):** 120 requests (/markets, two coin pages, /api/ticker, /api/crypto/markets, /status; 5 parallel × 4 rounds): **max 2.10 s, 0 over 3 s, all 200**. Unit tests: `src/lib/must-fix/goal-b31-reg1.test.ts`.
- **H-1**: one snapshot drives "Prices as at" and every price; the as-at never steps back (server memory only moves forward; the crypto tab and the client hook ignore an older snapshot); the coin page uses the snapshot price first (live print only for a coin not in the snapshot). /api/crypto/markets is `private, max-age=5` + `CDN-Cache-Control: no-store` (was public 30 s / swr 300); /api/ticker stays no-store. Snapshot meta tags are in `<head>` for every client (`htmlLimitedBots`), now also on /status. The static home page loads prices client-side, so it carries no server meta.
- **M-2**: /status probes cap at 1.5 s; on a timeout the row shows the last OK time with "· check timed out", not "unavailable".
- **G-05**: the tape gives up after 4 s, keeps last-good rows (amber after one miss), retries in 15 s and recovers on the next tick; no stuck "Loading prices…".
- **CR-2** (signed-in): plan, paper-book and FIF de minimis questions answer from static facts with no model call; quota and Headmaster reads cap at 1.5 s; the model call aborts at 7 s and falls back (a timed-out call is not counted); the exchange is stored in the background. Fixed rule: no speed or accuracy claims about the product, an import, a broker or a feed (guide and assistant).
- **G-10**: Confirm holds the dialog at most 1.2 s, then finishes in the background (a refusal rolls back with the reason in a toast); a saved row shows the NZ local date and a sell shows its realised NZ$ without a reload; /tax/realised date and holding cells forced visible; the deposit/withdrawal delete copy names the row (said "dividend"); the sell-delete dialog no longer repeats "Cancel changes nothing"; the Add panel traps Tab and returns focus to the opener after Escape.
- **Mobile /markets contrast**: the board always carries the dark tokens (#94a3b8 on #0f172a = 6.9:1; was 2.45:1).
- Not changed: `/_next/static` Content-Type (skipped per instruction; Lukas K-02).

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
- **G-20** scheduling: **PENDING.** `.github/workflows/cron.yml` (track record every 6 h; broker sync daily 16:00 UTC / 05:00 NZDT; `x-cron-secret` header, no email routes) is written but not in this PR: the push token lacks the `workflow` scope, and setting the `CRON_SECRET` Actions secret returned 403. Lukas lands the file and the secret.
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
