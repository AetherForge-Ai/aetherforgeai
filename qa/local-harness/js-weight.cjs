// Goal b12 M-1: JS bytes the browser actually downloads on a page (decoded and on-the-wire).
const { open, sleep } = require("./cdp.cjs");
(async () => {
  const b = await open(9342);
  const reqs = new Map();
  b.on((d) => {
    if (d.method === "Network.responseReceived" && /javascript/.test(d.params.response.mimeType || "")) reqs.set(d.params.requestId, { url: d.params.response.url });
    if (d.method === "Network.loadingFinished" && reqs.has(d.params.requestId)) reqs.get(d.params.requestId).bytes = d.params.encodedDataLength;
  });
  await b.send("Network.enable"); await b.send("Page.enable");
  await b.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  for (const path of (process.env.PAGES || "/,/markets").split(",")) {
    reqs.clear();
    await b.send("Network.clearBrowserCache");
    await b.send("Page.navigate", { url: "http://localhost:3917" + path }); await sleep(9000);
    const list = [...reqs.values()].filter((r) => r.bytes);
    const total = list.reduce((s, r) => s + r.bytes, 0);
    console.log(path, "files", list.length, "transferred_KB", (total / 1024).toFixed(1));
    if (process.env.TOP) list.sort((a, b) => b.bytes - a.bytes).slice(0, 10).forEach((r) => console.log("  ", (r.bytes / 1024).toFixed(1), r.url.replace(/.*_next/, "")));
  }
  b.close(); process.exit(0);
})();
