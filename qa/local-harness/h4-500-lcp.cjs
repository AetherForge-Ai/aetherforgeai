// b32 H-4: /dashboard/transactions?fixture=500, 3 cold runs in headless Chrome.
// Pass: LCP < 2500 ms and CLS < 0.1 on every run, quota strip present, 500 rows built.
// Local: BASE=http://localhost:3917 JAR=/tmp/jar.txt (cookie jar from the local harness sign-in).
// Production (TT): BASE=https://aetherforgeai.co.nz COOKIE='<session cookie header>' (allow-listed account).
const { open, sleep, cookiesFromJar } = require("./cdp.cjs");
const RUNS = 3;
const BASE = process.env.BASE || "http://localhost:3917";
const URL_ = `${BASE}/dashboard/transactions?fixture=500`;

function cookieList() {
  if (process.env.JAR) return cookiesFromJar(process.env.JAR).map((c) => ({ ...c, url: BASE + "/" }));
  return (process.env.COOKIE || "").split(";").map((p) => p.trim()).filter(Boolean).map((p) => {
    const i = p.indexOf("=");
    return { name: p.slice(0, i), value: p.slice(i + 1), url: BASE + "/" };
  });
}

(async () => {
  const results = [];
  for (let run = 1; run <= RUNS; run += 1) {
    const b = await open(9340 + run);
    await b.send("Page.enable");
    await b.send("Network.enable");
    await b.send("Network.clearBrowserCache");
    for (const c of cookieList()) await b.send("Network.setCookie", c);
    await b.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    await b.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `window.__lcp=0;window.__cls=0;
        new PerformanceObserver(l=>{for(const e of l.getEntries())window.__lcp=e.startTime}).observe({type:'largest-contentful-paint',buffered:true});
        new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.__cls+=e.value}).observe({type:'layout-shift',buffered:true});`,
    });
    const t0 = Date.now();
    await b.send("Page.navigate", { url: URL_ });
    let rows = 0;
    for (let i = 0; i < 60 && rows === 0; i += 1) {
      await sleep(250);
      rows = (await b.ev(`document.querySelector('[data-fixture-500]') ? 1 : 0`)) || 0;
    }
    await sleep(2500); // let LCP settle and catch late shifts
    const m = await b.ev(`({lcp: Math.round(window.__lcp), cls: Number(window.__cls.toFixed(4)), quota: !!document.querySelector('[data-server-quota]'), ledger: (document.body.innerText.match(/(\\d+) ledger rows/)||[])[1]||null, url: location.pathname + location.search})`);
    results.push({ run, ...m, wallMs: Date.now() - t0 });
    b.close();
    await sleep(500);
  }
  const pass = results.every((r) => r.lcp > 0 && r.lcp < 2500 && r.cls < 0.1 && r.quota && r.ledger === "500");
  console.log(JSON.stringify({ url: URL_, results, pass }, null, 2));
  process.exit(pass ? 0 : 1);
})();
