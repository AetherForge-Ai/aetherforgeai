const { spawn } = require("child_process");
const fs = require("fs");
const AXE = fs.readFileSync(process.env.AXE_PATH || "/tmp/axe/node_modules/axe-core/axe.min.js", "utf8");
const BASE = process.env.BASE || "http://localhost:3917";
const chrome = spawn("/usr/bin/google-chrome", ["--headless=new","--no-sandbox","--remote-debugging-port=9335","about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  await sleep(2500);
  const t = await (await fetch("http://127.0.0.1:9335/json")).json();
  const ws = new WebSocket(t.find((x) => x.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const p = {}; let bad = [];
  ws.onmessage = (m) => { const d = JSON.parse(m.data);
    if (d.id && p[d.id]) { p[d.id](d.result || d.error); delete p[d.id]; }
    if (d.method === "Network.responseReceived" && d.params.response.status >= 400) bad.push(`${d.params.response.status} ${d.params.response.url}`);
  };
  const send = (method, params = {}) => new Promise((r) => { p[++id] = r; ws.send(JSON.stringify({ id, method, params })); });
  const ev = async (e) => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result.value;
  await send("Network.enable"); await send("Page.enable");
  await send("Network.setCookie", { name: "af_cookie_consent", value: "declined", url: BASE });
  if (process.env.LOGIN_EMAIL) { await send("Page.navigate",{url:BASE+"/login"}); await sleep(3000); console.log("login:", await ev(`fetch("/api/auth/sign-in/email",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:${JSON.stringify(process.env.LOGIN_EMAIL)},password:${JSON.stringify(process.env.FIXTURE_PASSWORD||"")}})}).then(r=>r.status)`)); }
  const pages = (process.env.PAGES || "/,/pricing,/markets,/tax,/dashboard,/stox,/how-it-works,/changelog,/help,/demo").split(",");
  for (const path of pages) {
    bad = [];
    await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url: BASE + path }); await sleep(5000);
    await ev(`[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="Decline")?.click()`);
    await ev(AXE + ";0");
    const axe = await ev(`axe.run(document,{resultTypes:["violations"]}).then(r=>JSON.stringify(r.violations.filter(v=>v.impact==="serious"||v.impact==="critical").map(v=>({id:v.id,impact:v.impact,n:v.nodes.length,t:v.nodes.slice(0,3).map(x=>x.target.join(" ")+" :: "+x.html.slice(0,160)+" :: "+(x.failureSummary||"").slice(0,160))}))))`);
    const skip = await ev(`!!document.querySelector('a[href^="#"]') && [...document.querySelectorAll('a[href^="#"]')].some(a=>/skip/i.test(a.textContent))`);
    const ld = await ev(`JSON.stringify([...document.querySelectorAll('script[type="application/ld+json"]')].map(s=>{try{const j=JSON.parse(s.textContent);return [].concat(j["@graph"]||j).map(x=>x["@type"])}catch(e){return "PARSE_ERROR"}}))`);
    await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await sleep(1500);
    const hs = await ev(`(()=>{const w=document.documentElement.scrollWidth;const off=[...document.querySelectorAll("body *")].filter(e=>e.getBoundingClientRect().right>392).slice(0,4).map(e=>e.tagName+"."+String(e.className).slice(0,50));return JSON.stringify({w,off})})()`);
    console.log(JSON.stringify({ path, http4xx: bad, axe: JSON.parse(axe || "[]"), skip, ld: JSON.parse(ld || "[]"), at390: JSON.parse(hs) }));
  }
  ws.close(); chrome.kill(); process.exit(0);
})();
