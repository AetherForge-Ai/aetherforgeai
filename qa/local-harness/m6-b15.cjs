const { open, sleep } = require("./cdp.cjs");
const OUT = __dirname + "/shots-b15";
(async () => {
  const b = await open(9341);
  await b.send("Page.enable");
  await b.send("Page.navigate", { url: "http://localhost:3917/login" }); await sleep(3000);
  console.log("login", await b.ev(`fetch("/api/auth/sign-in/email",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:"m6-b15@example.test",password:${JSON.stringify(process.env.FIXTURE_PASSWORD||"")}})}).then(r=>r.status)`));
  for (const w of [1032, 1280, 1440, 1920, 360]) {
    await b.send("Emulation.setDeviceMetricsOverride", { width: w, height: 1100, deviceScaleFactor: 1, mobile: w < 768 });
    await b.send("Page.navigate", { url: "http://localhost:3917/dashboard" }); await sleep(9000);
    await b.ev(`[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="Decline")?.click()`);
    const r = await b.ev(`(()=>{const t=[...document.querySelectorAll("table")].find(t=>/return/i.test(t.innerText)&&t.offsetParent);const wrap=t?t.parentElement.closest(".overflow-x-auto")||t.parentElement:null;const n=document.querySelector("[data-full-name]");const nm=[...document.querySelectorAll("[data-full-name]")].find(e=>/Fisher/.test(e.textContent)&&e.offsetHeight>0);const cash=document.querySelector("[data-cash-actions]");const cs=cash?getComputedStyle(cash):null;if(t)t.scrollIntoView({block:"start"});return JSON.stringify({page:document.documentElement.scrollWidth,vw:innerWidth,wrap:wrap?[wrap.scrollWidth,wrap.clientWidth]:null,fphName:nm?{text:nm.textContent,clipped:nm.scrollWidth>nm.clientWidth,h:nm.offsetHeight}:null,cash:cash?{label:cash.getAttribute("aria-label"),color:cs.color,opacity:cs.opacity}:null})})()`);
    await sleep(400); await b.shot(`${OUT}/m6-${w}.png`); console.log(w, r);
  }
  const cash = await b.ev(`(()=>{const c=document.querySelector("[data-cash-actions]");if(!c)return "none";c.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,button:0,pointerType:"mouse"}));return "clicked"})()`);
  await sleep(700);
  console.log("cash menu", cash, await b.ev(`JSON.stringify([...document.querySelectorAll('[role="menuitem"]')].map(e=>e.textContent.trim()))`));
  b.close(); process.exit(0);
})();
