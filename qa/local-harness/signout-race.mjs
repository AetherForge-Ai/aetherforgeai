// b43 sign-out race (Chief ruling): a real browser, the same tab. Run against a local production build:
//   npx next build && <harness env> npx next start -p 3917 ; node qa/local-harness/signout-race.mjs
// Per delay (0/100/200 ms after the Sign out click, which is NOT awaited):
//  - the "Signing out…" overlay is up and a click on an account link does not navigate;
//  - an address-bar style navigation to /settings (page.goto, which skips the overlay) is recorded;
//  - the tab ends on /login; /settings then redirects with no session Set-Cookie; a reload is signed out;
//  - the old session cookie replayed from outside the browser is rejected.
import { chromium } from "@playwright/test";
import { fixturePassword } from "./fixture-password.mjs";
const BASE = process.env.BASE || "http://localhost:3917";
const EMAILS = ["fixture-g01-dividends@example.test", "fixture-h10-import@example.test", "fixture-l4-starter@example.test", "fixture-l4-pro@example.test", "fixture-cr6-free@example.test", "fixture-h9-tax@example.test"];
const SESSION_SET = /better-auth\.session_(token|data)=(?!;)[^;]+|af_ls=(?!;)[^;]+/;
const out = [];
const browser = await chromium.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
for (const [i, delay] of [0, 100, 200].entries()) {
  const EMAIL = EMAILS[(i + Number(process.env.OFFSET || 0)) % EMAILS.length];
  const IP = `10.43.${Date.now() % 250}.${i + 1}`; // local harness: own rate-limit bucket per run
  const s = await fetch(`${BASE}/api/auth/sign-in/email`, { method: "POST", headers: { "content-type": "application/json", Origin: BASE, "CF-Connecting-IP": IP }, body: JSON.stringify({ email: EMAIL, password: fixturePassword(EMAIL) }) });
  if (s.status !== 200) { out.push({ delay, skipped: `sign-in ${s.status}` }); continue; }
  const pairs = s.headers.getSetCookie().map((c) => c.split(";")[0]);
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addCookies(pairs.map((p) => { const k = p.indexOf("="); return { name: p.slice(0, k), value: p.slice(k + 1), url: BASE }; }));
  const page = await ctx.newPage();
  await page.setExtraHTTPHeaders({ "CF-Connecting-IP": IP });
  page.on("dialog", (d) => d.dismiss().catch(() => undefined)); // beforeunload while signing out: stay
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.locator('[aria-label^="Account menu"]').click({ timeout: 60000 });
  await page.locator('a[href="/logout"]').first().click({ noWaitAfter: true });
  if (delay) await page.waitForTimeout(delay);
  const overlay = await page.locator("#af-signing-out").isVisible().catch(() => false);
  // A user click on an in-app link while signing out must not navigate.
  const urlBefore = page.url();
  await page.mouse.click(700, 30).catch(() => undefined);
  await page.waitForTimeout(50);
  const clickBlocked = page.url() === urlBefore || new URL(page.url()).pathname === "/login";
  await page.waitForURL(/\/(login|logout)/, { timeout: 15000 }).catch(() => undefined);
  const landed = new URL(page.url()).pathname;
  const seen = [];
  page.on("response", async (r) => {
    if (new URL(r.url()).pathname === "/settings") {
      const sc = (await r.headersArray()).filter((h) => h.name.toLowerCase() === "set-cookie").map((h) => h.value);
      seen.push({ status: r.status(), sessionSet: sc.some((v) => SESSION_SET.test(v)) });
    }
  });
  await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" }).catch(() => undefined);
  const afterSettings = new URL(page.url()).pathname;
  const emailShown = (await page.content()).includes(EMAIL);
  await page.reload({ waitUntil: "domcontentloaded" }).catch(() => undefined);
  const afterReload = new URL(page.url()).pathname;
  const apiUser = await page.evaluate(async () => (await (await fetch("/api/session", { cache: "no-store" })).json()).user);
  const replay = await fetch(`${BASE}/settings`, { headers: { Cookie: pairs.join("; ") }, redirect: "manual" });
  out.push({ delay, overlay, clickBlocked, landed, settingsStatus: seen[0]?.status, sessionSetCookie: seen.some((x) => x.sessionSet), afterSettings, emailShown, afterReload, apiUser: apiUser ? "SIGNED IN" : null, oldCookieReplay: replay.status });
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify(out).replace(/\},\{/g, "},\n{"));
const bad = out.filter((r) => !r.skipped && (!r.overlay || !r.clickBlocked || r.landed !== "/login" || r.afterSettings !== "/login" || r.emailShown || r.afterReload !== "/login" || r.apiUser || r.sessionSetCookie || r.oldCookieReplay === 200));
const ran = out.filter((r) => !r.skipped).length;
console.log(bad.length || !ran ? `FAIL ${bad.length}/${ran}` : `PASS ${ran}/${ran}`);
process.exit(bad.length || !ran ? 1 : 0);
