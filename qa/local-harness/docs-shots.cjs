// Goal b12 M-2: one real UI screenshot per /docs guide, from a synthetic example book on a local build.
const { open, sleep } = require("./cdp.cjs");
const OUT = process.env.OUT || __dirname + "/../../public/docs";
const setv = (id, v) => `(()=>{const e=document.getElementById(${JSON.stringify(id)});if(!e)return false;const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;s.call(e,${JSON.stringify(v)});e.dispatchEvent(new Event('input',{bubbles:true}));return true})()`;
const click = (t) => `(()=>{const b=[...document.querySelectorAll("button,a,[role=tab]")].filter(b=>b.textContent.trim()===${JSON.stringify(t)}&&b.offsetParent);if(!b.length)return false;b[0].click();return true})()`;
const scrollTo = (re) => `(()=>{const e=[...document.querySelectorAll("h1,h2,h3,p,span,button,th")].find(e=>${re}.test(e.textContent)&&e.offsetParent);if(e){e.scrollIntoView({block:"start"});scrollBy(0,-90)}return !!e})()`;
(async () => {
  const b = await open(9343);
  await b.send("Page.enable");
  await b.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await b.send("Network.enable");
  await b.send("Network.setCookie", { name: "af_cookie_consent", value: "declined", url: "http://localhost:3917/" });
  await b.send("Page.navigate", { url: "http://localhost:3917/login" }); await sleep(3000);
  await b.ev(`fetch("/api/auth/sign-in/email",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:${JSON.stringify(process.env.LOGIN_EMAIL)},password:${JSON.stringify(process.env.FIXTURE_PASSWORD||"")}})}).then(r=>r.status)`);
  const dash = async (q = "") => { await b.send("Page.navigate", { url: "http://localhost:3917/dashboard" + q }); await sleep(8000); await b.ev(click("Decline")); };
  const shots = {
    "record-a-trade": async () => {
      await dash("?view=shares"); await b.ev(click("+ Add trade")); await sleep(1500);
      await b.ev(setv("record-search", "FPH")); await sleep(3500);
      await b.ev(`[...document.querySelectorAll('[role=dialog] button')].find(e=>e.textContent.trim().startsWith("FPH.NZ"))?.click()`); await sleep(2500);
      await b.ev(setv("record-qty", "5")); await sleep(600); await b.ev(click("Review")); await sleep(2500);
    },
    "edit-or-delete-a-row": async () => { await b.send("Page.navigate", { url: "http://localhost:3917/dashboard/transactions" }); await sleep(9000); await b.ev(click("Decline")); await b.ev(`window.scrollTo(0, document.body.scrollHeight)`); await sleep(2000); await b.ev(`(()=>{const t=[...document.querySelectorAll("table")].find(t=>/Ledger from the portfolio snapshot/.test(t.innerText));if(t)window.scrollTo(0,t.getBoundingClientRect().top+scrollY-110);return !!t})()`); await sleep(1200); },
    "import-a-csv": async () => { await dash(); await b.ev(click("Import CSV")); await sleep(2500); },
    "read-price-freshness": async () => { await dash("?view=shares"); await b.ev(`window.scrollTo(0, document.body.scrollHeight)`); await sleep(2000); await b.ev(`(()=>{const t=[...document.querySelectorAll("table")].find(t=>/Holdings from the portfolio snapshot/.test(t.innerText));if(t)window.scrollTo(0,t.getBoundingClientRect().top+scrollY-110);return !!t})()`); await sleep(1200); },
    "run-a-report": async () => { await dash(); await b.ev(scrollTo("/Run Stox report/")); await sleep(800); },
    "export-your-ledger": async () => { await dash(); await b.ev(click("Export")); await sleep(1500); },
    "income-and-tax-view": async () => { await b.send("Page.navigate", { url: "http://localhost:3917/tax/dividends" }); await sleep(8000); await b.ev(click("Decline")); await sleep(500); },
  };
  for (const [slug, run] of Object.entries(shots)) {
    if (process.env.ONLY && process.env.ONLY !== slug) continue;
    await run();
    await b.shot(`${OUT}/${slug}.png`);
    console.log("shot", slug);
  }
  b.close(); process.exit(0);
})();
