#!/usr/bin/env node
// Goal b16: test-mode fixture accounts for H-9 (tax pack: DRP + 2:1 split), H-10
// (broker import: preview / commit / duplicate / undo), L-4 (paid plans) and, from b20,
// CR-6 (Free account at the 10-holding cap).
//
// Safety:
// - Runs against the LOCAL harness by default (BASE_URL http://localhost:3917, mock
//   Totalum on :4555). A non-local BASE_URL is refused unless FIXTURE_ALLOW_REMOTE=1,
//   because on live every sign-up and transaction is a Totalum write.
// - Never touches TT's Free QA book: any email that is not *@example.test is refused.
// - Paid plans are set ONLY through the local mock (/__mock/patch). There is no
//   remote path for plans; on live that needs Stripe test checkout and is parked.
// - No email is sent. No keys are read; nothing is printed except statuses.
//
// Usage: node qa/fixtures/seed-fixture-accounts.mjs  (restart the local app first if sign-up returns 429: the sign-up limiter is per IP)
const BASE = process.env.BASE_URL || "http://localhost:3917";
const MOCK = process.env.MOCK_URL || "http://127.0.0.1:4555";
const PASSWORD = process.env.FIXTURE_PASSWORD || "Harness-Pass-123!";
const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE);
if (!local && process.env.FIXTURE_ALLOW_REMOTE !== "1") {
  console.error(`Refusing ${BASE}: fixtures on live are Totalum writes (parked). Set FIXTURE_ALLOW_REMOTE=1 only with approval.`);
  process.exit(2);
}

const FIXTURES = [
  {
    email: "fixture-h9-tax@example.test",
    name: "Fixture Tax",
    plan: "starter",
    rows: [
      { type: "opening_balance", amount: 20000, executed_at: "2025-03-01", confirm: true },
      { type: "buy", ticker: "FPH.NZ", asset_type: "stock", asset_name: "Fisher & Paykel Healthcare", quantity: 100, price: 32, fees: 10, executed_at: "2025-03-10", soft_override_confirmed: true, confirm: true },
      { type: "buy", ticker: "AAPL", asset_type: "stock", asset_name: "Apple Inc", quantity: 10, price: 220, fees: 5, currency: "USD", fx_rate: 1.75, executed_at: "2025-03-12", soft_override_confirmed: true, confirm: true },
      // NZ imputed dividend, US dividend with 15% withheld, DRP dividend; one each side of 31 Mar / 1 Apr.
      { type: "dividend", ticker: "FPH.NZ", asset_type: "stock", executed_at: "2025-03-31", dividend_gross: 20, dividend_imputation_nzd: 7.78, confirm: true },
      { type: "dividend", ticker: "AAPL", asset_type: "stock", currency: "USD", fx_rate: 1.75, executed_at: "2025-04-01", dividend_gross: 2.5, dividend_withholding: 0.38, confirm: true },
      { type: "dividend", ticker: "FPH.NZ", asset_type: "stock", executed_at: "2025-09-30", dividend_gross: 22, dividend_imputation_nzd: 8.56, dividend_drp: 22, dividend_drp_shares: 0.65, confirm: true },
    ],
    split: { ticker: "FPH.NZ", asset_type: "stock", ratio: 2, date: "2025-11-03" },
  },
  {
    email: "fixture-g01-dividends@example.test",
    name: "Fixture Dividends",
    plan: "starter",
    rows: [
      { type: "opening_balance", amount: 20000, executed_at: "2025-01-05", confirm: true },
      { type: "buy", ticker: "FPH.NZ", asset_type: "stock", asset_name: "Fisher & Paykel Healthcare", quantity: 100, price: 32, fees: 10, executed_at: "2025-03-10", soft_override_confirmed: true, confirm: true },
      { type: "buy", ticker: "AAPL", asset_type: "stock", asset_name: "Apple Inc", quantity: 10, price: 220, fees: 5, currency: "USD", fx_rate: 1.75, executed_at: "2025-03-12", soft_override_confirmed: true, confirm: true },
    ],
  },
  {
    email: "fixture-h10-import@example.test",
    name: "Fixture Import",
    plan: "starter",
    rows: [{ type: "opening_balance", amount: 10000, executed_at: "2026-01-05", confirm: true }],
  },
  { email: "fixture-l4-starter@example.test", name: "Fixture Starter", plan: "starter", rows: [{ type: "opening_balance", amount: 5000, executed_at: "2026-02-02", confirm: true }] },
  // Goal b20 CR-6: Free plan at its 10-holding cap, for the 11th-holding UI check and the holding delete.
  // FPH.NZ uses NZ$30 because a fill far from the delayed close is refused by fill integrity.
  {
    email: "fixture-cr6-free@example.test",
    name: "Fixture Free Cap",
    plan: "free",
    rows: [
      { type: "opening_balance", amount: 20000, executed_at: "2026-09-01", confirm: true },
      ...["AIR.NZ", "SPK.NZ", "FPH.NZ", "MEL.NZ", "IFT.NZ", "CEN.NZ", "MFT.NZ", "ATM.NZ", "KMD.NZ", "CNU.NZ"].map((ticker, i) => ({
        type: "buy", ticker, asset_type: "stock", asset_name: ticker, quantity: 10, price: ticker === "FPH.NZ" ? 30 : 2 + i, fees: 0, executed_at: "2026-09-02", soft_override_confirmed: true, confirm: true,
      })),
    ],
  },
  // Goal b20 SECURITY: an allow-listed test-hooks account (domain @example.invalid).
  { email: "fixture-hooks@example.invalid", name: "Fixture Hooks", plan: "free", rows: [{ type: "opening_balance", amount: 1000, executed_at: "2026-02-02", confirm: true }] },
  { email: "fixture-l4-pro@example.test", name: "Fixture Pro", plan: "pro", rows: [{ type: "opening_balance", amount: 5000, executed_at: "2026-02-02", confirm: true }] },
];

const json = { "content-type": "application/json", origin: BASE };
async function signIn(email) {
  const res = await fetch(`${BASE}/api/auth/sign-in/email`, { method: "POST", headers: json, body: JSON.stringify({ email, password: PASSWORD }) });
  const cookie = (res.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
  return { status: res.status, cookie };
}

for (const f of FIXTURES) {
  if (!/@example\.(test|invalid)$/.test(f.email)) throw new Error("fixture emails must be @example.test or @example.invalid");
  const up = await fetch(`${BASE}/api/auth/sign-up/email`, { method: "POST", headers: json, body: JSON.stringify({ email: f.email, password: PASSWORD, name: f.name, age_confirmed: true }) });
  if (local) {
    await fetch(`${MOCK}/__mock/patch`, { method: "POST", body: JSON.stringify({ table: "user", filter: { email: f.email }, set: { email_verified: true, subscription_plan: f.plan, subscription_status: "active" } }) });
  }
  const { status, cookie } = await signIn(f.email);
  const out = [];
  for (const row of f.rows) {
    const r = await fetch(`${BASE}/api/transactions`, { method: "POST", headers: { ...json, cookie }, body: JSON.stringify(row) });
    out.push(r.status);
  }
  if (f.split) {
    const r = await fetch(`${BASE}/api/transactions/split`, { method: "POST", headers: { ...json, cookie }, body: JSON.stringify(f.split) });
    out.push(`split:${r.status}`);
  }
  console.log(`${f.email} plan=${local ? f.plan : "free (plans need Stripe test checkout on live)"} signup=${up.status} signin=${status} rows=${out.join(",")}`);
}
