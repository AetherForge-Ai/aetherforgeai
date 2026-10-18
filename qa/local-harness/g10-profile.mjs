// b25 G-10: profile Totalum calls behind one buy, one dividend and one delete (local, mock latency).
// Local timings are not G-10 evidence; this counts calls and sequential depth only.
import { fixturePassword } from "./fixture-password.mjs";
const BASE = process.env.BASE || "http://localhost:3917", MOCK = "http://127.0.0.1:4555";
const EMAIL = process.env.FIXTURE_EMAIL || "fixture-g01-dividends@example.test";
const H = { "content-type": "application/json", Origin: BASE };
const s = await fetch(`${BASE}/api/auth/sign-in/email`, { method: "POST", headers: H, body: JSON.stringify({ email: EMAIL, password: fixturePassword(EMAIL) }) });
const cookie = s.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
const calls = async () => (await fetch(`${MOCK}/__mock/calls`)).json();
const depth = (cs) => { let d = 0, end = 0; for (const c of cs) { if (c.t >= end) { d++; end = c.t + Number(process.env.MOCK_LATENCY_MS || 150) - 5; } } return d; };
async function step(name, fn) {
  await calls(); const t0 = Date.now(); const r = await fn(); const ms = Date.now() - t0; const cs = await calls();
  const by = {}; for (const c of cs) { const k = `${c.m} ${c.p.split("/").slice(0, 2).join("/")}`; by[k] = (by[k] || 0) + 1; }
  console.log(`[g10] ${name}: ${r.status} ${ms}ms totalum=${cs.length} sequential≈${depth(cs)} ${JSON.stringify(by)}`);
  return r;
}
const post = (body) => fetch(`${BASE}/api/transactions`, { method: "POST", headers: { ...H, Cookie: cookie }, body: JSON.stringify(body) });
const buy = await step("buy FPH.NZ", () => post({ type: "buy", ticker: "FPH.NZ", asset_type: "stock", quantity: 1, price: 33, fees: 0, confirm: true, soft_override_confirmed: true }));
const bj = await buy.json().catch(() => ({}));
await step("dividend", () => post({ type: "dividend", ticker: "FPH.NZ", asset_type: "stock", dividend_gross: 10, confirm: true, allow_duplicate: true }));
const id = bj?.data?.transaction?._id || bj?.data?.id || bj?.data?._id;
console.log("buy response keys:", Object.keys(bj?.data || {}).join(","));
if (id) await step("delete buy", () => fetch(`${BASE}/api/transactions?id=${id}`, { method: "DELETE", headers: { ...H, Cookie: cookie } }));
