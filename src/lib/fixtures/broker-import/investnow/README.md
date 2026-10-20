# InvestNow import fixtures (BS-02) — EXAMPLE DATA

**EXAMPLE DATA. Real-layout unverified.**

InvestNow publishes no CSV export; its reports are Excel/PDF (General Ledger Report, Holdings). The
column headers below are invented. The parser does not rely on them: InvestNow files go through the
generic column map (the member matches columns in the preview; the map is saved per broker).

- `investnow-example.xlsx` — synthetic General Ledger Report sheet (title rows, then header, then 4 trades).
- `investnow-example.csv` — the same sheet "saved as CSV" (title rows kept, as Excel does).
- `investnow-example-bad-rows.*` — the 4 good rows plus 3 malformed rows.
- `expected.json` — the column map and the totals the import must reach (within NZ$0.01).
- `gen.cjs` — regenerates the files (`node gen.cjs` with the xlsx package).

Before the parser is called final: test against a redacted General Ledger .xlsx and Holdings .xlsx
from Lukas's own account. Unknown: whether the General Ledger is trade-level or a summary.
