// Goal b13 G-10: delete one ledger row and sample the row count and cash every 50 ms (local harness).
const { open, sleep } = require("./cdp.cjs");
(async () => {
  const b = await open(9352);
  await b.send("Page.enable"); await b.send("Network.enable");
  await b.send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
  await b.send("Network.setCookie", { name: "af_cookie_consent", value: "declined", url: "http://localhost:3917/" });
  await b.send("Page.navigate", { url: "http://localhost:3917/login" }); await sleep(3000);
  await b.ev(`fetch("/api/auth/sign-in/email",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:${JSON.stringify(process.env.LOGIN_EMAIL)},password:"Harness-Pass-123!"})}).then(r=>r.status)`);
  await b.send("Page.navigate", { url: "http://localhost:3917/dashboard/transactions" }); await sleep(9000);
  const probe = `(()=>{const t=[...document.querySelectorAll("table")].find(t=>/Ledger from the portfolio snapshot/.test(t.innerText));const n=t?t.querySelectorAll("tbody tr").length:-1;const c=[...document.querySelectorAll("*")].find(e=>e.children.length<4&&/^CASH/i.test(e.textContent.trim())&&/NZ\\$/.test(e.textContent));return JSON.stringify({n,cash:c?c.textContent.replace(/\\s+/g," ").slice(0,30):null})})()`;
  console.log("before", await b.ev(probe));
  await b.ev(`window.__samples=[];window.__t0=performance.now();const t=[...document.querySelectorAll("table")].find(t=>/Ledger from the portfolio snapshot/.test(t.innerText));const row=[...t.querySelectorAll("tbody tr")].find(r=>/Dividend/.test(r.innerText));[...row.querySelectorAll("button")].find(x=>x.textContent.trim()==="Delete").click();true`);
  await sleep(300);
  // A confirm dialog, if shown.
  await b.ev(`(()=>{const btn=[...document.querySelectorAll("[role=dialog] button,[role=alertdialog] button")].find(x=>/^(Delete|Remove|Confirm)/.test(x.textContent.trim()));window.__t0=performance.now();if(btn)btn.click();return !!btn})()`);
  const out = [];
  for (let i = 0; i < 60; i++) { out.push(JSON.parse(await b.ev(`JSON.stringify({ms:Math.round(performance.now()-window.__t0),p:${probe}})`))); await sleep(50); }
  const rows = out.map((o) => ({ ms: o.ms, ...JSON.parse(o.p) }));
  const first = rows[0];
  const changed = rows.find((r) => r.n !== first.n);
  const cashChanged = rows.find((r) => r.cash !== first.cash);
  console.log("start", JSON.stringify(first), "rowChangeMs", changed?.ms, "cashChangeMs", cashChanged?.ms, "minRows", Math.min(...rows.map((r) => r.n)), "end", JSON.stringify(rows[rows.length - 1]));
  process.exit(0);
})();
