// Goal b20: CR-6 11th-holding UI check and holding delete on the Free fixture (local harness only).
const { open, sleep } = require("./cdp.cjs");
const setv = (id, v) => `(()=>{const e=document.getElementById(${JSON.stringify(id)});if(!e)return false;const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;s.call(e,${JSON.stringify(v)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true})()`;
const clickText = (t) => `(()=>{const b=[...document.querySelectorAll("button")].filter(b=>b.textContent.trim()===${JSON.stringify(t)} && b.offsetParent && !b.disabled);if(!b.length)return false;b[b.length-1].click();return true})()`;
const SEARCH = process.env.SEARCH || "THL";
(async () => {
  const b = await open(9355);
  let reloads = 0;
  b.on((d) => { if (d.method === "Page.frameNavigated" && !d.params.frame.parentId) reloads++; });
  await b.send("Page.enable");
  await b.send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
  await b.send("Network.setCookie", { name: "af_cookie_consent", value: "declined", url: "http://localhost:3917/" });
  await b.send("Page.navigate", { url: "http://localhost:3917/login" }); await sleep(3000);
  console.log("signin", await b.ev(`fetch("/api/auth/sign-in/email",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:"fixture-cr6-free@example.test",password:"Harness-Pass-123!"})}).then(r=>r.status)`));
  console.log("holdings(api)", await b.ev(`fetch("/api/stocks").then(r=>r.json()).then(j=>(j.data||[]).length)`));
  await b.send("Page.navigate", { url: "http://localhost:3917/dashboard?view=shares" }); await sleep(9000);
  const deleteButtons = () => b.ev(`new Set([...document.querySelectorAll("button[aria-label^='Delete ']")].map(x=>x.getAttribute("aria-label"))).size`);
  console.log("delete buttons before", await deleteButtons());
  // --- CR-6: 11th holding through the Buy dialog.
  reloads = 0;
  await b.ev(`[...document.querySelectorAll("button")].filter(b=>/Add trade/.test(b.textContent)&&b.offsetParent).pop()?.click()`);
  await sleep(4000);
  await b.shot("/tmp/cr6-afterclick.png");
  await b.ev(setv("record-search", SEARCH)); await sleep(5000);
  const picked = await b.ev(`(()=>{const x=[...document.querySelectorAll('[role=dialog] button')].find(e=>e.textContent.trim().toUpperCase().startsWith(${JSON.stringify(SEARCH)}));if(!x)return null;x.click();return x.textContent.trim().slice(0,40)})()`);
  console.log("picked", picked, "dialogs", await b.ev(`document.querySelectorAll('[role=dialog]').length`)); await sleep(1500);
  await b.ev(setv("record-qty", "10")); await b.ev(setv("record-price", "1.5")); await sleep(500);
  console.log("review", await b.ev(clickText("Review"))); await sleep(2500);
  const labels = JSON.parse(await b.ev(`JSON.stringify([...document.querySelectorAll('[role=dialog] button')].filter(b=>b.offsetParent).map(b=>b.textContent.trim()))`));
  const confirm = labels.find((t) => /^confirm/i.test(t));
  console.log("confirm label", confirm);
  const t0 = Date.now();
  await b.ev(clickText(confirm || "Confirm"));
  let msg = null;
  for (let i = 0; i < 40 && !msg; i++) {
    await sleep(100);
    msg = await b.ev(`(()=>{const d=document.querySelector('[role=dialog]');if(!d)return null;const m=d.innerText.match(/You've reached your plan's limit[^\\n]*/);return m?m[0]:null})()`);
  }
  const dialogOpen = await b.ev(`!!document.querySelector('[role=dialog]')`);
  const flashed = await deleteButtons();
  console.log("cap message", msg ? `${Date.now() - t0}ms: ${msg}` : "NOT SHOWN", "dialogOpen", dialogOpen, "delete buttons after", flashed, "reloads", reloads);
  console.log("holdings(api) after", await b.ev(`fetch("/api/stocks").then(r=>r.json()).then(j=>(j.data||[]).length)`));
  await b.shot("/workspace/b6/repo/qa/local-harness/shots-b20-cr6.png");
  await b.ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await sleep(800);
  await b.ev(clickText("Cancel")); await sleep(800);
  // --- Holding delete: remove CNU.NZ, sample row count every 50 ms.
  await b.ev(`document.querySelector("button[aria-label='Delete CNU.NZ']")?.click()`); await sleep(600);
  const before = await deleteButtons();
  await b.ev(`(()=>{window.__t0=performance.now();const x=[...document.querySelectorAll('[role=alertdialog] button')].find(e=>/^Remove|^Delete/.test(e.textContent.trim()));x&&x.click();return !!x})()`);
  const s = [];
  for (let i = 0; i < 60; i++) { s.push(JSON.parse(await b.ev(`JSON.stringify({ms:Math.round(performance.now()-window.__t0),n:new Set([...document.querySelectorAll("button[aria-label^='Delete ']")].map(x=>x.getAttribute("aria-label"))).size,cnu:!!document.querySelector("button[aria-label='Delete CNU.NZ']")})`))); await sleep(50); }
  const gone = s.find((r) => !r.cnu);
  console.log("holding delete: before", before, "cnuGoneMs", gone?.ms, "minButtons", Math.min(...s.map((r) => r.n)), "end", JSON.stringify(s[s.length - 1]), "reappeared", s.some((r, i) => i > 0 && r.cnu && s.slice(0, i).some((p) => !p.cnu)));
  console.log("holdings(api) end", await b.ev(`fetch("/api/stocks").then(r=>r.json()).then(j=>(j.data||[]).map(x=>x.ticker).join(" "))`));
  b.close(); process.exit(0);
})();
