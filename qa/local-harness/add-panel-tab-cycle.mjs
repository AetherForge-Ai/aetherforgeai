// b45 G-14: Playwright Tab-cycle check for the Add panel (record-transaction-dialog).
// Run against a local production build (see signout-race.mjs header), then:
//   node qa/local-harness/add-panel-tab-cycle.mjs
// For 3 runs at 1400 px and 390 px: open the Add panel, press Tab 60 times and Shift+Tab 60 times;
// after every key press document.activeElement must be inside the dialog (or a popover it opened).
// The run fails if focus ever lands on <body> or anywhere else on the page, or if fewer than 3 distinct
// controls were visited (a trap that pins focus on one element is not a pass).
import { chromium } from "@playwright/test";
import { fixturePassword } from "./fixture-password.mjs";
const BASE = process.env.BASE || "http://localhost:3917";
const EMAILS = ["fixture-h10-import@example.test", "fixture-l4-starter@example.test", "fixture-cr6-free@example.test"];
const out = [];
const browser = await chromium.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
for (const [i, width] of [1400, 390, 1400].entries()) {
  const EMAIL = EMAILS[(i + Number(process.env.OFFSET || 0)) % EMAILS.length];
  const IP = `10.45.${Date.now() % 250}.${i + 1}`; // local harness only: own rate-limit bucket per run
  const s = await fetch(`${BASE}/api/auth/sign-in/email`, { method: "POST", headers: { "content-type": "application/json", Origin: BASE, "CF-Connecting-IP": IP }, body: JSON.stringify({ email: EMAIL, password: fixturePassword(EMAIL) }) });
  if (s.status !== 200) { out.push({ run: i + 1, width, skipped: `sign-in ${s.status}` }); continue; }
  const pairs = s.headers.getSetCookie().map((c) => c.split(";")[0]);
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  await ctx.addCookies(pairs.map((p) => { const k = p.indexOf("="); return { name: p.slice(0, k), value: p.slice(k + 1), url: BASE }; }));
  const page = await ctx.newPage();
  await page.setExtraHTTPHeaders({ "CF-Connecting-IP": IP });
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /add holding|add your first holding|^add$/i }).first().click({ timeout: 60000 });
  const dialog = page.locator('[data-testid="record-transaction-dialog"]');
  await dialog.waitFor({ state: "visible", timeout: 15000 });
  const where = () => page.evaluate(() => {
    const a = document.activeElement;
    const d = document.querySelector('[data-testid="record-transaction-dialog"]');
    const inside = !!(a && d && (d.contains(a) || a.closest("[data-radix-popper-content-wrapper], [role='listbox']")));
    const tag = a ? `${a.tagName.toLowerCase()}${a.getAttribute("aria-label") ? `[${a.getAttribute("aria-label")}]` : a.getAttribute("name") ? `[name=${a.getAttribute("name")}]` : ""}` : "none";
    return { inside, tag };
  });
  const escapes = [];
  const visited = new Set();
  for (const key of [...Array(60).fill("Tab"), ...Array(60).fill("Shift+Tab")]) {
    await page.keyboard.press(key);
    const w = await where();
    visited.add(w.tag);
    if (!w.inside) escapes.push(`${key} -> ${w.tag}`);
  }
  out.push({ run: i + 1, width, escapes: escapes.slice(0, 5), escapeCount: escapes.length, distinct: visited.size });
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify(out).replace(/\},\{/g, "},\n{"));
const ran = out.filter((r) => !r.skipped);
const bad = ran.filter((r) => r.escapeCount > 0 || r.distinct < 3);
console.log(bad.length || !ran.length ? `FAIL ${bad.length}/${ran.length}` : `PASS ${ran.length}/${ran.length}`);
process.exit(bad.length || !ran.length ? 1 : 0);
