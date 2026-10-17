const { spawn } = require("child_process");
const fs = require("fs");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function open(port = 9336) {
  const chrome = spawn("/usr/bin/google-chrome", ["--headless=new","--no-sandbox",`--remote-debugging-port=${port}`,"about:blank"], { stdio: "ignore" });
  await sleep(2500);
  const t = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const ws = new WebSocket(t.find((x) => x.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const p = {}; const listeners = [];
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && p[d.id]) { p[d.id](d.result || { error: d.error }); delete p[d.id]; } if (d.method) listeners.forEach((f) => f(d)); };
  const send = (method, params = {}) => new Promise((r) => { p[++id] = r; ws.send(JSON.stringify({ id, method, params })); });
  const ev = async (e) => { const r = await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true }); return r.result ? r.result.value : r; };
  const shot = async (f) => { const s = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(f, Buffer.from(s.data, "base64")); };
  const close = () => { ws.close(); chrome.kill(); };
  return { send, ev, shot, close, on: (f) => listeners.push(f) };
}
function cookiesFromJar(path) {
  return fs.readFileSync(path, "utf8").split("\n").filter((l) => l && (!l.startsWith("#") || l.startsWith("#HttpOnly_"))).map((l) => { const c = l.replace(/^#HttpOnly_/, "").split("\t"); return { name: c[5], value: c[6], url: "http://localhost:3917/" }; });
}
module.exports = { open, sleep, cookiesFromJar };
