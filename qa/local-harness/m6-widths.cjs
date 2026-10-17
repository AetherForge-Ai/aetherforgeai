// Goal b12 M-6: holdings wrapper must not clip at desktop widths; no page scroll at 390.
const { open, sleep } = require("./cdp.cjs");
const OUT = process.env.OUT || __dirname + "/shots-b12";
(async () => {
  const b = await open(9341);
  await b.send("Page.enable");
  await b.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await b.send("Page.navigate", { url: "http://localhost:3917/login" }); await sleep(3000);
  await b.ev(`fetch("/api/auth/sign-in/email",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:${JSON.stringify(process.env.LOGIN_EMAIL)},password:"Harness-Pass-123!"})}).then(r=>r.status)`);
  for (const w of (process.env.WIDTHS || "1034,1280,1440,1920,390").split(",").map(Number)) {
    await b.send("Emulation.setDeviceMetricsOverride", { width: w, height: 1100, deviceScaleFactor: 1, mobile: w < 768 });
    await b.send("Page.navigate", { url: "http://localhost:3917/dashboard?view=shares" }); await sleep(8000);
    await b.ev(`[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="Decline")?.click()`);
    const r = await b.ev(`(()=>{const t=[...document.querySelectorAll("table")].find(t=>/Total return|Return/.test(t.innerText)&&t.offsetParent);const wrap=t?t.parentElement.closest(".overflow-x-auto")||t.parentElement:null;const gt=t?t.querySelector("tfoot td"):null;let gtVis=null;if(gt&&wrap){const a=gt.getBoundingClientRect(),c=wrap.getBoundingClientRect();gtVis=a.right<=c.right+1}const wr=wrap?{scroll:wrap.scrollWidth,client:wrap.clientWidth}:null;if(t)t.scrollIntoView({block:"start"});return JSON.stringify({page:document.documentElement.scrollWidth,vw:innerWidth,table:!!t,wrap:wr,grandTotalVisible:gtVis})})()`);
    await sleep(500);
    await b.shot(`${OUT}/m6-${w}.png`);
    console.log(w, r);
  }
  b.close(); process.exit(0);
})();
