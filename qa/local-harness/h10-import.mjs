// Goal b22 H-10: upload (preview), commit, duplicate, undo, bad rows and the size cap, through /api/import.
// Local harness only. The password comes from the seed file at run time and is never printed.
import { readFileSync } from "node:fs";
const BASE = process.env.BASE || "http://localhost:3917";
const EMAIL = process.env.FIXTURE_EMAIL || "fixture-h10-import@example.test";
const PASS = /PASSWORD\s*=\s*[^"]*"([^"]+)"/.exec(readFileSync("qa/fixtures/seed-fixture-accounts.mjs", "utf8"))[1];
const H = { "content-type": "application/json", Origin: BASE };
const sign = await fetch(`${BASE}/api/auth/sign-in/email`, { method: "POST", headers: H, body: JSON.stringify({ email: EMAIL, password: PASS }) });
const cookie = sign.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
console.log("signin", sign.status);
const api = async (body, raw) => {
  const r = await fetch(`${BASE}/api/import`, { method: "POST", headers: { ...H, Cookie: cookie }, body: raw ?? JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, j };
};
const cash = async () => (await (await fetch(`${BASE}/api/portfolio/snapshot`, { headers: { Cookie: cookie } })).json()).data?.kpis?.cash?.value ?? null;
const exp = JSON.parse(readFileSync("src/lib/fixtures/broker-import/expected-totals.json", "utf8"));
const results = [];
const file = (n) => readFileSync(`src/lib/fixtures/broker-import/${n}`, "utf8");
for (const name of ["asb.csv", "jarden.csv", "commsec.csv", "stake.csv", "hatch.csv"]) {
  const text = file(name);
  const before = await cash();
  const pv = await api({ text });
  const c = await api({ text, confirm: true, acknowledgeSkipped: true, fundBuys: false });
  const after = await cash();
  const delta = before != null && after != null ? Math.round((after - before) * 100) / 100 : null;
  const want = exp[name]?.cashNzd;
  console.log(`[import] ${name} preview=${pv.status} toWrite=${pv.j?.data?.toWrite?.length ?? "?"} commit=${c.status} written=${c.j?.data?.written ?? "?"} cashDelta=${delta} expected=${want}`);
  if (c.status !== 200) console.log(`[import] ${name} commit error: ${c.j?.error ?? ""}`);
  results.push([`${name} commits to expected cash within NZ$0.01`, c.status === 200 && want != null && delta != null && Math.abs(delta - want) <= 0.01]);
  const dup = await api({ text, confirm: true, acknowledgeSkipped: true });
  console.log(`[import] ${name} duplicate status=${dup.status} code=${dup.j?.code ?? ""} error=${dup.j?.error ?? ""}`);
  results.push([`${name} duplicate upload rejected`, dup.status === 409]);
  if (name === "asb.csv") {
    const batchId = c.j?.data?.batchId;
    const u = await api({ action: "undo", batchId });
    const restored = await cash();
    console.log(`[import] undo ${name} status=${u.status} undone=${u.j?.data?.undone} cashAfterUndo=${restored} cashBefore=${before}`);
    results.push(["undo restores cash", u.status === 200 && Math.abs((restored ?? NaN) - (before ?? NaN)) <= 0.01]);
  }
}
const bad = await api({ text: file("bad-rows.csv") });
const errs = (bad.j?.data?.unsupported ?? []).length;
console.log(`[import] bad-rows preview=${bad.status} errors=${errs} good=${bad.j?.data?.toWrite?.length}`);
results.push(["3 bad rows give 3 errors", errs === 3]);
const big = "Date,Type,Ticker,Quantity,Price\n" + "2026-01-01,Buy,AIR.NZ,1,0.40\n".repeat(Math.ceil((6 * 1024 * 1024) / 29));
const tooBig = await api({ text: big });
console.log(`[import] 6 MB body (${(big.length / 1048576).toFixed(2)} MiB) status=${tooBig.status} error=${tooBig.j?.error ?? ""}`);
results.push(["6 MB file rejected (413)", tooBig.status === 413]);
for (const [n, ok] of results) console.log(ok ? "PASS" : "FAIL", n);
process.exit(results.every((r) => r[1]) ? 0 : 1);
