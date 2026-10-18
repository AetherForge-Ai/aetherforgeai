// Goal b23 G-01: NZ imputed, US 15% withheld and DRP dividends through /api/transactions.
// Checks ledger rows, cash, income/total return, CSV totals = page, and the 31 Mar / 1 Apr tax-year boundary.
// Local harness only. The password comes from the seed file at run time and is never printed.
import { readFileSync } from "node:fs";
const BASE = process.env.BASE || "http://localhost:3917";
const EMAIL = "fixture-g01-dividends@example.test";
const PASS = /PASSWORD\s*=\s*[^"]*"([^"]+)"/.exec(readFileSync("qa/fixtures/seed-fixture-accounts.mjs", "utf8"))[1];
const H = { "content-type": "application/json", Origin: BASE };
const sign = await fetch(`${BASE}/api/auth/sign-in/email`, { method: "POST", headers: H, body: JSON.stringify({ email: EMAIL, password: PASS }) });
const cookie = sign.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
console.log("signin", sign.status);
const get = (p) => fetch(`${BASE}${p}`, { headers: { Cookie: cookie } });
const snap = async () => (await (await get("/api/portfolio/snapshot")).json()).data;
// Finds the FPH.NZ row anywhere in the snapshot groups and reads its share count.
const sharesOf = (snapData, ticker) => {
  let found;
  const walk = (o) => { if (found !== undefined || !o || typeof o !== "object") return; if (o.ticker === ticker && (o.shares ?? o.quantity) != null) { found = Number(o.shares ?? o.quantity); return; } for (const v of Object.values(o)) walk(v); };
  walk(snapData?.groups);
  return found;
};
const r2 = (n) => Math.round(n * 100) / 100;
const results = [];
const check = (name, ok, detail = "") => { results.push([name, ok]); console.log(`[g01] ${name}: ${detail}`); };

const before = await snap();
const cash0 = before?.kpis?.cash?.value;
const fph0 = sharesOf(before, "FPH.NZ");
const USD_FX = 1.7322; // frankfurter.dev rate for 2026-04-01 (inside the 5% band)
const divs = [
  { label: "NZ imputed FPH.NZ 31 Mar", body: { type: "dividend", ticker: "FPH.NZ", asset_type: "stock", executed_at: "2026-03-31", dividend_gross: 100, dividend_imputation_nzd: 38.89 } },
  { label: "US 15% withheld AAPL 1 Apr", body: { type: "dividend", ticker: "AAPL", asset_type: "stock", executed_at: "2026-04-01", dividend_gross: 2.6, dividend_withholding: 0.39, fx_rate: USD_FX } },
  { label: "DRP FPH.NZ 15 May", body: { type: "dividend", ticker: "FPH.NZ", asset_type: "stock", executed_at: "2026-05-15", dividend_gross: 50, dividend_drp: 50, dividend_drp_shares: 1.5 } },
];
for (const d of divs) {
  const r = await fetch(`${BASE}/api/transactions`, { method: "POST", headers: { ...H, Cookie: cookie }, body: JSON.stringify({ ...d.body, confirm: true }) });
  const j = await r.json().catch(() => null);
  check(`${d.label} saved`, r.status === 200 && j?.ok !== false, `status=${r.status} ${j?.error ?? ""}`);
}
const usdGross = r2(2.6 * USD_FX), usdWh = r2(0.39 * USD_FX);
const wantCash = r2(100 + (usdGross - usdWh) + 0);
const after = await snap();
const cash1 = after?.kpis?.cash?.value;
check("cash rises by net cash (DRP adds none)", cash0 != null && cash1 != null && Math.abs(r2(cash1 - cash0) - wantCash) <= 0.01, `delta=${r2(cash1 - cash0)} want=${wantCash}`);
const fph1 = sharesOf(after, "FPH.NZ");
check("DRP adds 1.5 FPH.NZ shares", fph0 != null && fph1 != null && Math.abs(fph1 - fph0 - 1.5) < 1e-6, `before=${fph0} after=${fph1}`);

const csv = async (y) => (await (await get(`/api/tax/dividends/export?year=${y}`)).text()).trim().split("\n");
const c26 = await csv(2026), c27 = await csv(2027);
const body = (lines) => lines.slice(1, -1);
const tot = (lines) => lines.at(-1).split(",");
check("31 Mar in TY2026 only", body(c26).length === 1 && body(c26)[0].includes("FPH.NZ"), `rows=${body(c26).length}`);
check("1 Apr and 15 May in TY2027", body(c27).length === 2, `rows=${body(c27).length}`);
const col = (lines, i) => r2(body(lines).reduce((s, l) => s + Number(l.split(",")[i] || 0), 0));
let csvOk = true;
for (const lines of [c26, c27]) for (const i of [5, 6, 7, 8, 9]) if (Math.abs(col(lines, i) - Number(tot(lines)[i])) > 0.001) csvOk = false;
check("CSV total line = sum of its rows", csvOk, `TY2026 gross=${tot(c26)[5]} TY2027 gross=${tot(c27)[5]}`);
const fmt = (n) => "NZ$" + n.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const html = (await (await get("/tax/dividends")).text()).replace(/<!-- -->/g, "");
const sum = (i) => r2(Number(tot(c26)[i]) + Number(tot(c27)[i]));
const grossAll = sum(5), impAll = sum(6), whAll = sum(7), drpAll = sum(8), netAll = sum(9);
const pageLine = `Combined totals: gross ${fmt(grossAll)}, imputation credits ${fmt(impAll)},`;
check("page combined totals = CSV TY2026 + TY2027", html.includes(pageLine) && html.includes(`withholding ${fmt(whAll)}, DRP ${fmt(drpAll)}`), pageLine);
check("total return = net cash + DRP", html.includes(`total return ${fmt(r2(netAll + drpAll))}`), `net=${netAll} drp=${drpAll}`);
check("expected figures", grossAll === r2(150 + usdGross) && impAll === 38.89 && whAll === usdWh && drpAll === 50, `gross=${grossAll} imp=${impAll} wh=${whAll} drp=${drpAll}`);
for (const [n, ok] of results) console.log(ok ? "PASS" : "FAIL", n);
process.exit(results.every((r) => r[1]) ? 0 : 1);
