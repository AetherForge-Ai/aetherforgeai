# TT preview grade b97 (develop 3f99d450, localhost:8794), 5 Nov 2026 ~10:00 NZDT, read-only, signed out
Build: v3-b98-2026-11-10
P0: 0
P1: 0
P2: 0
P3: 1 (build-version not bumped)
Source: preview cwd /workspace/b94prev HEAD `3f99d450` (#641, above 22a51d20 #640). The served `.open-next` bundle contains the b97 code (visual-reader, DEX-1). Method: same as preview-b96: headless Chrome via puppeteer-core plus the box Lighthouse CLI. Proof is in preview-b97/.

| Item | Grade | Sev |
|---|---|---|
| DEX-1 label equals rendered rows | PASS | - |
| G-24 reader runs on-device, no upload (code, bundle and assets) | PASS (static) | - |
| G-24 nothing saved before review | PASS (static) | - |
| G-24 AI-off switch | PASS (static) | - |
| G-24 signed-in import panel, live network capture with a real PDF/PNG | BLOCKED (/import redirects to /login; Totalum sign-in times out from the box) | - |
| CLS home 390 / 1440 | PASS | - |
| /build-version.txt still says v3-b96-2026-11-02 | FAIL | P3 |

## DEX-1 (PR #640)
- At 1440, /markets?tab=dex after 20 s: the label reads "Showing 64 of up to 400" and the pager reads "Showing 1–25 of 64".
- Paging through all pages showed 25 + 25 + 14 = 64 rows, all 64 unique. The label matches.
- Proof: preview-b97/dex-1440.png, preview-b97/dex-lastpage-1440.png.
- Repro: open /markets?tab=dex, wait for the list, and page through with Next.

## G-24 (PR #641)
- `src/lib/import/visual-reader.ts` loads pdf.js and tesseract.js through dynamic import. The worker, core and eng model all come from `/import-reader/*` on the same site, and all four return 200 from the preview. The reader code has no fetch call and no external host.
- In `PasteTradesBox.tsx`, `readFile` puts the extracted text into the box, then shows the review table. The note says "Nothing is saved until you confirm there." The component's only network calls are GETs to /api/stocks and /api/fx, and it never POSTs file contents.
- AI switch: the default is OFF. It is stored only in the localStorage key `af:paste-import-ai`. The toggle is disabled unless the NEXT_PUBLIC_PASTE_IMPORT_AI site flag is on, and `pasteAiMode` returns rules-only unless both are on. The file reader doesn't use AI on any path.
- Unit test `g24-visual-reader.test.ts`: 3/3 pass.
- Signed out, /import → /login?redirect=%2Fimport. No non-GET requests were captured. Proof: preview-b97/import-signedout.png.
- BLOCKED: a live CDP capture of a real PDF and screenshot import, plus the toggle UI. Regrade once Totalum is reachable from the box.

## CLS (CLS-1 ≤0.05)
- 390 mobile: CLS 0.00027, perf 0.88. Proof: preview-b97/lh-390.json.
- 1440 desktop: CLS 0.00021, perf 1.00. Proof: preview-b97/lh-1440.json.
- Both are in line with b96.

## P3: build id
- Problem: /build-version.txt (public/) still says `v3-b96-2026-11-02` at 3f99d450.
- Fix: bump it to v3-b97-… before marking READY. Release-gate/live checks key on this id.

Cleanup: puppeteer and Lighthouse Chrome exited, and no scripts are running. No POSTs or sign-ins were made, and pid 4380 was not touched.
