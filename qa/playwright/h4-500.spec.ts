// b37 H-4: /dashboard/transactions?fixture=500 for an allow-listed account.
// Pass, on each of 3 runs: LCP < 2,500 ms; CLS < 0.1; the report quota shows within 1 s of the first byte,
// with no "did not load" alert; "500 ledger rows"; no React #418 / hydration error; no 503 response.
import { test, expect } from "@playwright/test";

const PATH = "/dashboard/transactions?fixture=500";

test.beforeEach(async ({ page, context }) => {
  if (!process.env.PW_STORAGE && process.env.H4_EMAIL && process.env.H4_PASSWORD) {
    const res = await page.request.post("/api/auth/sign-in/email", {
      data: { email: process.env.H4_EMAIL, password: process.env.H4_PASSWORD },
    });
    expect(res.ok(), "sign-in").toBeTruthy();
  }
  await context.addInitScript(() => {
    const w = window as unknown as { __lcp: number; __cls: number; __quotaAt: number | null };
    w.__lcp = 0;
    w.__cls = 0;
    w.__quotaAt = null;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) w.__lcp = e.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as Array<PerformanceEntry & { hadRecentInput?: boolean; value?: number }>)
        if (!e.hadRecentInput) w.__cls += e.value || 0;
    }).observe({ type: "layout-shift", buffered: true });
    const seen = () => {
      if (w.__quotaAt == null && document.querySelector("[data-server-quota]")) w.__quotaAt = performance.now();
    };
    new MutationObserver(seen).observe(document, { childList: true, subtree: true });
  });
});

test("H-4: 500-row ledger, LCP/CLS, quota < 1 s, no #418, no 503", async ({ page }) => {
  const consoleErrors: string[] = [];
  const bad: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(String(e)));
  page.on("response", (r) => {
    if (r.status() === 503) bad.push(`${r.status()} ${r.url()}`);
  });

  await page.goto(PATH, { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-fixture-500]")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/500 ledger rows/)).toBeVisible();
  await expect(page.locator("[data-server-quota]")).toBeVisible({ timeout: 5_000 });
  await expect(page.locator("[data-server-quota][role=alert]")).toHaveCount(0);
  await page.waitForTimeout(2_500); // LCP settles and late shifts are caught

  const m = await page.evaluate(() => {
    const w = window as unknown as { __lcp: number; __cls: number; __quotaAt: number | null };
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    return { lcp: Math.round(w.__lcp), cls: Number(w.__cls.toFixed(4)), quotaMs: w.__quotaAt == null ? null : Math.round(w.__quotaAt - nav.responseStart) };
  });
  console.log(`[h4] LCP ${m.lcp} ms · CLS ${m.cls} · quota ${m.quotaMs} ms after first byte`);
  expect(m.lcp).toBeGreaterThan(0);
  expect(m.lcp).toBeLessThan(2_500);
  expect(m.cls).toBeLessThan(0.1);
  expect(m.quotaMs).not.toBeNull();
  expect(m.quotaMs!).toBeLessThan(1_000);
  expect(consoleErrors.filter((t) => /#418|[Hh]ydration/.test(t))).toEqual([]);
  expect(bad).toEqual([]);
});
