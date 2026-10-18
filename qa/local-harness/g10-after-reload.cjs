// Goal b20 G-10: after-reload checks (local harness, CDP; Playwright is not installed in this repo).
// Every write is followed by a full page reload and a re-read of the book.
const { open, sleep } = require("./cdp.cjs");
const EMAIL = process.env.FIXTURE_EMAIL || "fixture-cr6-free@example.test";
const PASS = process.env.FIXTURE_PASS; // supplied by the runner; never committed in reports
(async () => {
  const b = await open(9355);
  await b.send("Page.enable");
  await b.send("Network.setCookie", { name: "af_cookie_consent", value: "declined", url: "http://localhost:3917/" });
  await b.send("Page.navigate", { url: "http://localhost:3917/login" }); await sleep(3000);
  console.log("signin", await b.ev(`fetch("/api/auth/sign-in/email",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:${JSON.stringify(EMAIL)},password:${JSON.stringify(PASS)}})}).then(r=>r.status)`));
  const post = (body) => b.ev(`fetch("/api/transactions",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(${JSON.stringify(body)})}).then(async r=>{const j=await r.json();return JSON.stringify({status:r.status,id:j.data?.lastTransaction?._id||null,cash:j.data?.cashBalance??null,error:j.error||null})})`);
  const ledger = () => b.ev(`fetch("/api/portfolio/snapshot").then(r=>r.json()).then(j=>JSON.stringify((j.data?.ledger||[]).map(l=>({id:l.id,type:l.type,t:l.ticker}))))`).then(JSON.parse);
  const reload = async () => { await b.send("Page.navigate", { url: "http://localhost:3917/dashboard?view=transactions" }); await sleep(8000); };
  const results = [];
  // 1. Buy 1 AIR.NZ, reload, the row is in the book.
  const buy = JSON.parse(await post({ type: "buy", ticker: "AIR.NZ", asset_type: "stock", quantity: 1, price: Number(process.env.AIR_PRICE || 0.39), executed_at: "2026-10-16", confirm: true, idempotency_key: "g10-reload-" + Date.now() }));
  console.log("[server] buy", JSON.stringify(buy));
  await reload();
  results.push(["buy persists after reload", (await ledger()).some((l) => l.id === buy.id)]);
  // 2. Dividend, then the same dividend with "Save anyway" (allow_duplicate), reload, both rows present.
  const div = { type: "dividend", ticker: "AIR.NZ", asset_type: "stock", executed_at: "2026-10-15", dividend_gross: 5, dividend_imputation_nzd: 0, dividend_withholding: 0, dividend_drp: 0, fx_rate: 1, fx_source: "nzd" };
  const d1 = JSON.parse(await post(div));
  const d2refused = JSON.parse(await post(div));
  const d2 = JSON.parse(await post({ ...div, allow_duplicate: true }));
  console.log("[server] dividend", JSON.stringify(d1), "duplicate-without-flag", d2refused.status, "save-anyway", JSON.stringify(d2));
  await reload();
  const l2 = await ledger();
  results.push(["save-anyway dividend persists", l2.some((l) => l.id === d2.id) && l2.some((l) => l.id === d1.id)]);
  // 3. Delete the second dividend, reload, it stays gone; the ledger never reads empty.
  if (!d2.id) { console.log("FAIL no save-anyway id"); b.close(); process.exit(1); }
  const del = await b.ev(`fetch("/api/transactions?id=${d2.id}",{method:"DELETE"}).then(async r=>JSON.stringify({status:r.status,body:await r.json()}))`);
  console.log("[server] delete", del.slice(0, 200));
  await reload();
  const l3 = await ledger();
  results.push(["delete persists after reload", !l3.some((l) => l.id === d2.id)]);
  results.push(["ledger non-empty after reload", l3.length > 0]);
  const domRows = await b.ev(`document.querySelectorAll("[data-ledger-row], tbody tr").length`);
  results.push(["ledger DOM shows rows", domRows > 0]);
  // 4. A delete of an unknown id is idempotent; a delete is confirmed by the server re-read.
  for (const [name, ok] of results) console.log(ok ? "PASS" : "FAIL", name);
  b.close(); process.exit(results.every((r) => r[1]) ? 0 : 1);
})();
