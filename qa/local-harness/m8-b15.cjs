const { open, sleep } = require("./cdp.cjs");
(async () => {
  const b = await open(9341);
  await b.send("Page.enable");
  const errs = [];
  await b.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
  await b.send("Page.navigate", { url: "http://localhost:3917/login" }); await sleep(2500);
  await b.ev(`fetch("/api/auth/sign-out",{method:"POST",headers:{"content-type":"application/json"},body:"{}"})`);
  console.log("login", await b.ev(`fetch("/api/auth/sign-in/email",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:"m8-b15@example.test",password:${JSON.stringify(process.env.FIXTURE_PASSWORD||"")}})}).then(r=>r.status)`));
  await b.send("Page.navigate", { url: "http://localhost:3917/dashboard" }); await sleep(9000);
  for (const tab of ["Holdings", "Transactions", "Income & Tax", "Insights"]) {
    await b.ev(`[...document.querySelectorAll('[role="tab"],button')].find(e=>e.textContent.trim()===${JSON.stringify(tab)})?.click()`); await sleep(1500);
    console.log(tab, await b.ev(`/Add your first holding/.test(document.body.innerText)`));
    await b.shot(`${__dirname}/shots-b15/m8-${tab.replace(/\W+/g, "")}.png`);
  }
  console.log("console errors (window.onerror)", await b.ev(`JSON.stringify(window.__errs||[])`));
  b.close(); process.exit(0);
})();
