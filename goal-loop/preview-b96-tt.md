# TT preview grade v3-b96-2026-11-02 (main bbb2dab, localhost:8794), 2 Nov 2026, read-only, signed out
P0: 0
P1: 0
P2: 0
P3: 1 (GATE-1 naming note, below)
Build: /build-version.txt = `v3-b96-2026-11-02`; preview cwd /workspace/b94prev at `bbb2dab6` (Merge PR #637). Matches expectation.
Method: same as preview-b94-cls.md. Lighthouse CLI, headless Chrome, perf + accessibility, run twice per width. Mobile form factor at 360/390/412/768 (h 800), desktop preset at 1024/1440 (h 900), DPR 1. Proof (JSON and final screenshots) is in preview-b96/.

| Item | Grade | Sev |
|---|---|---|
| CLS-1, home CLS at 6 widths | PASS | - |
| Metals badge reflow | PASS | - |
| Gap under ticker strip | PASS | - |
| M-7 contrast on / and /markets | PASS (dashboard BLOCKED) | - |
| GATE-1 convention | PASS, with a naming note | P3 |
| /dashboard, G-02 performance, G-09 CSV, import and test hooks | BLOCKED (Totalum sign-in times out from the box; no sign-in attempted) | - |

## 1. CLS on / (target CLS-1 ≤0.05; Manager claims ≤0.0003)
| width | run1 | run2 |
|---|---|---|
| 360 | 0.00018 | 0.00018 |
| 390 | 0.00026 | 0.00026 |
| 412 | 0.00026 | 0.00026 |
| 768 | 0.00033 | 0.00033 |
| 1024 | 0.00025 | 0.00025 |
| 1440 | 0.00019 | 0.00019 |
- All widths are about 150x under the target. At 768 the value is 0.00033, just over Manager's ≤0.0003 claim. That difference doesn't matter.
- Live b87 was 0.099 on 1 Nov; b94 preview was 0.023.
- What shifted: the ticker row (`div.ticker-row > div.flex`, ≤0.0003), then the FX span "1 USD = NZ$…" or the "Show NZ$" button (≤0.0001).
- The hero doesn't move at any width.
- Metals badge: no layout-shift entry points at the metals row or the SPOT badge, so it doesn't reflow.
- Gap: at 1024 (final-1024-1.jpg) there's about 65–70px between the strip bottom and the hero chip. That's normal padding. At 360 it's about 100px, made up of the strip footer (source/FX row) plus padding. Not a large empty gap.
- Note, same as b94: CRYPTO on the local build shows "Last updated: unavailable" and "last refresh did not return a quote". This is probably local data access. Recheck it on live.

## 2. M-7 contrast (GOAL-LOCK #17: axe 0 contrast failures on home, /markets, /dashboard; one green for text)
- Lighthouse color-contrast audit (axe): score 1, 0 failing elements.
  - On /: at all 12 runs (mobile and desktop).
  - On /markets: mobile and desktop.
- Accessibility category score is 1.00 everywhere.
- One green: the server-rendered markup uses only the `text-gain` token for green text (on /markets). No hard-coded green text classes were found on / or /markets. Client-rendered colours weren't checked.
- /dashboard is BLOCKED (needs a sign-in). M-7 overall stays PARTIAL until /dashboard is scanned.

## 3. GATE-1 (process item)
- Repo `goal-loop/README.md` and `src/lib/release-gate.ts` at bbb2dab: READY needs `goal-loop/READY_TO_PUBLISH` with the build id, plus a `goal-loop/preview-bNN-*.md` file. That file must contain the build id and the lines `P0: 0` and `P1: 0`. The unit test runs in CI. Grade: PASS (convention exists and matches BACKLOG).
- P3 naming note:
  - The gate's prefix is `preview-b96-` (with the hyphen), so a file named just `preview-b96.md` does NOT match.
  - TT therefore also wrote an identical `preview-b96-tt.md`.
  - Both files are in the TT QA folder, not in the repo. The gate only sees files in the repo, so Manager has to commit `preview-b96-tt.md` to `goal-loop/` on the release branch.
  - Suggested fix: document the hyphenated name in README and BACKLOG, or make the gate accept `preview-bNN.md` as well.
- GATE-1's goal (live P0/P1 rate under 2%) can only be proven once builds are live.

## Blocked (not fail)
/dashboard (M-7 part), G-02 XIRR/performance, G-09 CSV, import and test hooks: Totalum sign-in times out from the box. No sign-in was tried, no POSTs were sent and no hooks were run.
Cleanup: Lighthouse Chrome instances exited. Other Chrome processes on the box belong to the desktop browser and were left alone. No scripts are left running.
