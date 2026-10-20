// b44 production proof (TT request): same-tab sign-out at 1/101/202 ms after the Sign out click (not
// awaited), then a reload, then a fresh sign-in through the /login form. Fixture fixture-h9-tax@example.test
// only; the password is read from the box fixtures file and never printed. GET/POST to auth routes only.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { fixturePassword } from "./fixture-password.mjs";
const BASE = process.env.BASE || "https://aetherforgeai.co.nz";
const OUT = process.env.OUT || "/workspace/aetherforge-qa/goal-loop/b44-signout-playwright";
// CI (signout-race.yml) passes FIXTURE_EMAIL / FIXTURE_PASSWORD from repository secrets; neither is printed.
const EMAIL = process.env.FIXTURE_EMAIL || "fixture-h9-tax@example.test";
const PASS = fixturePassword(EMAIL);
mkdirSync(OUT, { recursive: true });
const SESSION_SET = /better-auth\.session_(token|data)=(?!;)[^;]+|af_ls=(?!;)[^;]+/;
const t = () => new Date().toLocaleTimeString("en-NZ", { timeZone: "Pacific/Auckland", hour12: false });
const log = [];
const note = (o) => { const line = { t: t(), ...o }; log.push(line); console.log(JSON.stringify(line)); };
const browser = await chromium.launch({ ...(process.env.CI ? {} : { executablePath: process.env.CHROME || "/usr/bin/google-chrome" }), args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
page.on("dialog", (d) => d.dismiss().catch(() => undefined));
async function formSignIn(tag) {
  await page.goto(`${BASE}/login?redirect=/settings`, { waitUntil: "domcontentloaded" });
  await page.locator("#email").fill(EMAIL);
  await page.locator("#password").fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }).catch(() => undefined);
  await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
  const path = new URL(page.url()).pathname;
  const shown = (await page.content()).includes(EMAIL);
  const err = path.startsWith("/login") ? ((await page.locator('[role="alert"]').first().textContent({ timeout: 1000 }).catch(() => "")) || "").trim().slice(0, 120) : "";
  // Signed-in pages show the account email, so CI (SIGNED_IN_SHOTS=0) skips these screenshots.
  if (process.env.SIGNED_IN_SHOTS !== "0") await page.screenshot({ path: `${OUT}/${tag}.png` });
  return { path, shown, err };
}
const first = await formSignIn("00-initial-sign-in");
note({ step: "initial sign-in", ...first });
const results = [];
if (first.path === "/settings" && first.shown) {
  for (const delay of [1, 101, 202]) {
    const cookiesBefore = (await ctx.cookies(BASE)).filter((c) => /session_token|af_ls/.test(c.name)).map((c) => `${c.name}=${c.value}`);
    await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
    await page.locator('[aria-label^="Account menu"]').click({ timeout: 60000 });
    await page.locator('a[href="/logout"]').first().click({ noWaitAfter: true });
    await page.waitForTimeout(delay);
    const overlay = await page.locator("#af-signing-out").isVisible().catch(() => false);
    await page.screenshot({ path: `${OUT}/d${delay}-1-after-click.png` });
    await page.waitForURL(/\/(login|logout)/, { timeout: 20000 }).catch(() => undefined);
    const landed = new URL(page.url()).pathname;
    await page.reload({ waitUntil: "domcontentloaded" }).catch(() => undefined);
    const seen = [];
    const onResp = async (r) => {
      if (new URL(r.url()).pathname === "/settings") {
        const sc = (await r.headersArray()).filter((h) => h.name.toLowerCase() === "set-cookie").map((h) => h.value);
        seen.push(sc.some((v) => SESSION_SET.test(v)));
      }
    };
    page.on("response", onResp);
    await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" }).catch(() => undefined);
    page.off("response", onResp);
    const afterReloadSettings = new URL(page.url()).pathname;
    const emailShown = (await page.content()).includes(EMAIL);
    const apiUser = await page.evaluate(async () => (await (await fetch("/api/session", { cache: "no-store" })).json()).user).catch(() => "error");
    await page.screenshot({ path: `${OUT}/d${delay}-2-after-reload.png` });
    const replay = await fetch(`${BASE}/settings`, { headers: { Cookie: cookiesBefore.join("; ") }, redirect: "manual" });
    const replayLoc = replay.headers.get("location") || "";
    const fresh = await formSignIn(`d${delay}-3-fresh-sign-in`);
    const r = {
      delay, overlay, landed, afterReloadSettings, emailShown, apiUser: apiUser ? (apiUser === "error" ? "error" : "SIGNED IN") : null,
      sessionSetCookieOnSettings: seen.some(Boolean), oldCookieReplay: `${replay.status} ${replayLoc.slice(0, 40)}`,
      freshSignIn: fresh.path === "/settings" && fresh.shown ? "OK" : `FAIL ${fresh.path} ${fresh.err}`,
    };
    r.pass = r.overlay && r.landed === "/login" && r.afterReloadSettings === "/login" && !r.emailShown && !r.apiUser && !r.sessionSetCookieOnSettings && replay.status !== 200 && r.freshSignIn === "OK";
    note(r);
    results.push(r);
    if (r.freshSignIn !== "OK") break;
  }
}
await browser.close();
const summary = results.length ? results.map((r) => `${r.delay} ms: ${r.pass ? "PASS" : "FAIL"}`).join(", ") : `NOT RUN (initial sign-in: ${first.path} ${first.err})`;
note({ summary });
writeFileSync(`${OUT}/log.jsonl`, log.map((l) => JSON.stringify(l)).join("\n") + "\n");
process.exit(results.length === 3 && results.every((r) => r.pass) ? 0 : 1);
