// Goal b18 M-1: decoded (uncompressed) and transferred JS on a page, mobile viewport.
const { open, sleep } = require("./cdp.cjs");
(async () => {
  const b = await open(Number(process.env.CDP_PORT || 9342));
  const reqs = new Map();
  b.on((d) => {
    if (d.method === "Network.responseReceived" && /javascript/.test(d.params.response.mimeType || "")) reqs.set(d.params.requestId, { url: d.params.response.url, decoded: 0, wire: 0 });
    if (d.method === "Network.dataReceived" && reqs.has(d.params.requestId)) reqs.get(d.params.requestId).decoded += d.params.dataLength;
    if (d.method === "Network.loadingFinished" && reqs.has(d.params.requestId)) reqs.get(d.params.requestId).wire = d.params.encodedDataLength;
  });
  await b.send("Network.enable"); await b.send("Page.enable");
  await b.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  for (const path of (process.env.PAGES || "/,/markets").split(",")) {
    reqs.clear();
    await b.send("Network.clearBrowserCache");
    await b.send("Page.navigate", { url: "http://localhost:3917" + path }); await sleep(10000);
    const list = [...reqs.values()];
    const dec = list.reduce((s, r) => s + r.decoded, 0), wire = list.reduce((s, r) => s + r.wire, 0);
    console.log(path, "files", list.length, "decoded_KB", (dec / 1024).toFixed(1), "transferred_KB", (wire / 1024).toFixed(1));
    if (process.env.TOP) list.sort((a, c) => c.decoded - a.decoded).slice(0, 12).forEach((r) => console.log("  ", (r.decoded / 1024).toFixed(1), r.url.replace(/.*_next/, "")));
  }
  b.close(); process.exit(0);
})();
