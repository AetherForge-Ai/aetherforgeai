# cron-dispatch (BS-01 / G-20)
Cloudflare Worker Cron Trigger that dispatches `.github/workflows/cron.yml` (job=broker-sync / track-record)
without relying on GitHub's scheduler. Guard reused from `scripts/cron-watchdog.mjs`: success-since-slot check,
skip while a cron.yml run is queued/running, max 2 workflow_dispatch runs per slot. Catch-up (`:55`) waits the
same 45-min grace; on-slot fires dispatch immediately if the slot has no success yet.
Tests: `src/lib/cron-dispatch-worker.test.ts` (run in CI). Not deployed; needs `GH_ACTIONS_DISPATCH_TOKEN`
(actions:write, this repo only) and a Cloudflare token with Account > Workers Scripts: Edit.
