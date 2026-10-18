// Goal b19 G-10: /tax/dividends delete — row count sampled every 50 ms after confirm (local harness).
const { open, sleep } = require("./cdp.cjs");
(async () => {
  const b = await open(9353);
  await b.send("Page.enable");
  await b.send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
  await b.send("Network.setCookie", { name: "af_cookie_consent", value: "declined", url: "http://localhost:3917/" });
  await b.send("Page.navigate", { url: "http://localhost:3917/login" }); await sleep(3000);
  await b.ev(`fetch("/api/auth/sign-in/email",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:${JSON.stringify(process.env.LOGIN_EMAIL)},password:"Harness-Pass-123!"})}).then(r=>r.status)`);
  await b.send("Page.navigate", { url: "http://localhost:3917/tax/dividends" }); await sleep(9000);
  const probe = `(()=>{const rows=[...document.querySelectorAll("tbody tr")].filter(r=>[...r.querySelectorAll("button")].some(x=>/^(Delete|Removing)/.test(x.textContent.trim())));return rows.length})()`;
  const before = await b.ev(probe);
  console.log("before rows", before);
  await b.ev(`[...document.querySelectorAll("tbody tr button")].find(x=>x.textContent.trim()==="Delete").click();true`);
  await sleep(400);
  await b.ev(`window.__t0=performance.now();[...document.querySelectorAll("[role=alertdialog] button")].find(x=>/Delete dividend/.test(x.textContent)).click();true`);
  const s = [];
  for (let i = 0; i < 60; i++) { s.push(JSON.parse(await b.ev(`JSON.stringify({ms:Math.round(performance.now()-window.__t0),n:${probe}})`))); await sleep(50); }
  const drop = s.find((r) => r.n < before);
  console.log("firstDropMs", drop?.ms, "minRows", Math.min(...s.map((r) => r.n)), "end", JSON.stringify(s[s.length - 1]), "reloaded", await b.ev("performance.getEntriesByType('navigation').length"));
  b.close(); process.exit(0);
})();
