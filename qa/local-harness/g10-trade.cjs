const { open, sleep, cookiesFromJar } = require("./cdp.cjs");
const setv = (id, v) => `(()=>{const e=document.getElementById(${JSON.stringify(id)});const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;s.call(e,${JSON.stringify(v)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true})()`;
const clickText = (t) => `(()=>{const b=[...document.querySelectorAll("button")].filter(b=>b.textContent.trim()===${JSON.stringify(t)} && b.offsetParent && !b.disabled);if(!b.length)return false;b[b.length-1].click();return true})()`;
(async () => {
  const b = await open(9338);
  let reloads = 0;
  b.on((d) => { if (d.method === "Page.frameNavigated" && !d.params.frame.parentId) reloads++; });
  await b.send("Network.enable"); await b.send("Page.enable");
  await b.send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
  // Sign in inside the browser (local mock account only).
  await b.send("Page.navigate", { url: "http://localhost:3917/login" }); await sleep(3000);
  await b.ev(`fetch("/api/auth/sign-in/email",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:${JSON.stringify(process.env.LOGIN_EMAIL)},password:${JSON.stringify(process.env.FIXTURE_PASSWORD||"")}})}).then(r=>r.status)`);
  await b.send("Network.setCookie", { name: "af_cookie_consent", value: "declined", url: "http://localhost:3917/" });
  await b.send("Page.navigate", { url: "http://localhost:3917/dashboard?view=shares" }); await sleep(8000);
  await b.ev(clickText("Decline"));
  const before = await b.ev(`[...document.querySelectorAll('table')].some(x=>x.innerText.includes('AIR.NZ'))`);
  reloads = 0;
  await b.ev(clickText("+ Add trade")); await sleep(1500);
  await b.ev(setv("record-search", "AIR")); await sleep(3500);
  await b.ev(`[...document.querySelectorAll('[role=dialog] button')].find(e=>e.textContent.trim().startsWith("AIR.NZAir"))?.click()`); await sleep(1500);
  await b.ev(setv("record-qty", process.env.QTY||"100")); await b.ev(setv("record-price", "0.385")); await sleep(500);
  console.log("review:", await b.ev(clickText("Review"))); await sleep(2500);
  await b.shot("/tmp/g10-review.png");
  const btns = await b.ev(`JSON.stringify([...document.querySelectorAll('[role=dialog] button')].filter(b=>b.offsetParent).map(b=>b.textContent.trim()).slice(0,15))`);
  console.log("buttons:", btns);
  const confirmLabel = JSON.parse(btns).find((t) => /^confirm/i.test(t));
  // Arm a watcher that timestamps the first frame where the holding row and new cash both show.
  await b.ev(`(()=>{const cnt=()=>{const d=document.querySelector('[role=dialog]');let t=document.body.innerText;if(d)t=t.replace(d.innerText,'');return {n:(t.match(/AIR\.NZ/g)||[]).length,cash:(t.match(/CASH[\\s\\S]{0,8}?-?NZ\\$[\\d,.]+/)||[''])[0]}};window.__base=cnt();window.__t0=0;window.__hit=0;window.__cashT=0;window.__rowT=0;(function w(){if(window.__t0&&!window.__hit){const c=cnt();if(!window.__rowT&&c.n>window.__base.n)window.__rowT=performance.now();if(!window.__cashT&&c.cash&&c.cash!==window.__base.cash)window.__cashT=performance.now();if(window.__rowT&&window.__cashT){window.__hit=Math.max(window.__rowT,window.__cashT);window.__after=c}}requestAnimationFrame(w)})();return JSON.stringify(window.__base)})()`).then((x) => console.log("baseline:", x));
  await b.ev(`(()=>{window.__t0=performance.now();return ${clickText(confirmLabel || "Confirm")}})()`);
  await sleep(4000);
  const r = await b.ev(`JSON.stringify({t0:window.__t0,hit:window.__hit,rowMs:window.__rowT?Math.round(window.__rowT-window.__t0):null,cashMs:window.__cashT?Math.round(window.__cashT-window.__t0):null,ms:window.__hit?Math.round(window.__hit-window.__t0):null,after:window.__after})`);
  await b.shot("/tmp/g10-after.png");
  console.log("confirm:", confirmLabel, r, "beforeHadRow:", before, "reloads:", reloads);
  b.close(); process.exit(0);
})();
