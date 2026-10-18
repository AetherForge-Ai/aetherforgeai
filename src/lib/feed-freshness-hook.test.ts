import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { priceBadge, PRICE_AMBER_MS, PRICE_FRESH_MS } from "@/lib/price-confidence";
import { documentAccess } from "@/lib/route-gate";
import { shapeStatusFeed, statusFeedBody } from "@/lib/status-feeds";
import {
  FEED_FORCE_LABEL,
  FEED_FRESHNESS_WINDOWS,
  applyFeedForce,
  feedForceCookieValue,
  forcedRefreshMisses,
  readFeedForce,
} from "@/lib/feed-freshness-hook";

const read = (path: string) => readFileSync(path, "utf8");

describe("G-05 feed force hook", () => {
  it("reads a named stale or failed mark only when the caller is allow-listed", () => {
    const cookie = `a=1; ${"af_test_feed_force"}=crypto:stale`;
    expect(readFeedForce(cookie, false)).toBeNull();
    expect(readFeedForce(cookie, true)).toEqual({ name: "crypto", state: "stale" });
    expect(readFeedForce("af_test_feed_force=equity:failed", true)).toEqual({ name: "equity", state: "failed" });
    expect(readFeedForce("af_test_feed_force=fx:nope", true)).toBeNull();
    expect(readFeedForce("af_test_feed_force=bonds:stale", true)).toBeNull();
    expect(readFeedForce("", true)).toBeNull();
    expect(readFeedForce(null, true)).toBeNull();
  });

  it("paints the named cell amber, then red, and reset leaves every cell alone", () => {
    const rows = [
      { label: FEED_FORCE_LABEL.crypto, tone: "ok" as const, text: "10 Oct 2026, 1:00 pm" },
      { label: FEED_FORCE_LABEL.equity, tone: "ok" as const, text: "10 Oct 2026, 1:00 pm" },
    ];
    const stale = applyFeedForce(rows, { name: "crypto", state: "stale" });
    expect(stale[0]).toMatchObject({ tone: "amber", text: "— stale (test hook): previous print kept" });
    expect(stale[1].tone).toBe("ok");
    const failed = applyFeedForce(rows, { name: "crypto", state: "failed" });
    expect(failed[0].tone).toBe("red");
    expect(failed[0].text).toBe("— failed (test hook)");
    expect(applyFeedForce(rows, null)).toEqual(rows);
    expect(feedForceCookieValue({ name: "metals", state: "failed" })).toBe("metals:failed");
  });

  it("turns price badges amber on age or one miss, and red on a longer age or a second miss", () => {
    const now = new Date("2026-10-18T12:00:00.000Z");
    const base = {
      source: "Public market data (Yahoo Finance)",
      delay: "Delayed, not a direct NZX or ASX feed",
      now,
      refreshOk: true,
      failedRefreshes: 0,
    };
    expect(PRICE_FRESH_MS).toBe(20 * 60 * 1000);
    expect(PRICE_AMBER_MS).toBe(24 * 60 * 60 * 1000);
    expect(priceBadge({ ...base, quotedAt: new Date(now.getTime() - 5 * 60 * 1000) }).tone).toBe("green");
    expect(priceBadge({ ...base, quotedAt: new Date(now.getTime() - 25 * 60 * 1000) }).tone).toBe("amber");
    expect(priceBadge({ ...base, quotedAt: new Date(now.getTime() - 25 * 60 * 60 * 1000) }).tone).toBe("red");
    expect(priceBadge({ ...base, quotedAt: new Date(now.getTime() - 5 * 60 * 1000), refreshOk: false, failedRefreshes: 1 }).tone).toBe("amber");
    expect(priceBadge({ ...base, quotedAt: new Date(now.getTime() - 5 * 60 * 1000), refreshOk: false, failedRefreshes: 2 }).tone).toBe("red");
    expect(priceBadge({ ...base, quotedAt: null, refreshOk: false, failedRefreshes: 1 }).tone).toBe("red");

    const fresh = new Date(now.getTime() - 60 * 1000);
    expect(forcedRefreshMisses({ name: "crypto", state: "stale" }, "crypto", 0)).toBe(1);
    expect(forcedRefreshMisses({ name: "crypto", state: "failed" }, "crypto", 0)).toBe(2);
    expect(forcedRefreshMisses({ name: "crypto", state: "failed" }, "equity", 0)).toBe(0);
    expect(
      priceBadge({
        ...base,
        quotedAt: fresh,
        refreshOk: false,
        failedRefreshes: forcedRefreshMisses({ name: "equity", state: "stale" }, "equity", 0),
      }).tone
    ).toBe("amber");
    expect(
      priceBadge({
        ...base,
        quotedAt: fresh,
        refreshOk: false,
        failedRefreshes: forcedRefreshMisses({ name: "equity", state: "failed" }, "equity", 0),
      }).tone
    ).toBe("red");
  });

  it("ages status cells amber, then red, and a failure with no print is red", () => {
    const now = Date.parse("2026-10-18T12:00:00.000Z");
    const crypto = FEED_FRESHNESS_WINDOWS.crypto;
    const recent = new Date(now - 5 * 60 * 1000).toISOString();
    const amberAge = new Date(now - 20 * 60 * 1000).toISOString();
    const redAge = new Date(now - 90 * 60 * 1000).toISOString();
    expect(shapeStatusFeed({ label: "Crypto quotes", at: recent, now, ...crypto }).tone).toBe("ok");
    expect(shapeStatusFeed({ label: "Crypto quotes", at: amberAge, now, ...crypto }).tone).toBe("amber");
    expect(shapeStatusFeed({ label: "Crypto quotes", at: redAge, now, ...crypto }).tone).toBe("red");
    expect(shapeStatusFeed({ label: "Crypto quotes", at: recent, now, ...crypto, failed: true }).tone).toBe("amber");
    expect(shapeStatusFeed({ label: "Crypto quotes", at: null, now, ...crypto, failed: true, failedText: "— switched off by the operator" })).toEqual({
      label: "Crypto quotes",
      tone: "red",
      text: "— switched off by the operator",
    });
    expect(shapeStatusFeed({ label: "Metals spot", at: null, now, ...FEED_FRESHNESS_WINDOWS.metals }).tone).toBe("amber");

    const equity = FEED_FRESHNESS_WINDOWS.equity;
    const fiveDays = new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString();
    const eightDays = new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString();
    expect(shapeStatusFeed({ label: "Equity quotes", at: fiveDays, now, ...equity }).tone).toBe("amber");
    expect(shapeStatusFeed({ label: "Equity quotes", at: eightDays, now, ...equity }).tone).toBe("red");

    const ok = shapeStatusFeed({ label: "Exchange rates", at: recent, now, ...FEED_FRESHNESS_WINDOWS.fx });
    expect(statusFeedBody(ok)).toMatch(/^Last OK /);
    expect(statusFeedBody({ label: "Crypto quotes", tone: "red", text: "— failed (test hook)" })).toBe("— failed (test hook)");
    const blob = `${ok.text} ${statusFeedBody({ label: "Crypto quotes", tone: "amber", text: "— stale (test hook): previous print kept" })}`;
    expect(blob).not.toMatch(/\breal-time\b|\bofficial\b|\blicensed\b/i);
  });

  it("keeps the hook behind the test-hooks gate and out of the shared hook file", () => {
    expect(documentAccess("/test-hooks")).toBe("test-hooks");
    expect(documentAccess("/test-hooks/feed-freshness")).toBe("test-hooks");
    const page = read("src/app/test-hooks/feed-freshness/page.tsx");
    expect(page).toMatch(/currentUserMayUseTestHooks\(\)\)\) notFound\(\)/);
    expect(page).toContain("FeedFreshnessHookPanel");
    const hook = read("src/lib/feed-freshness-hook.ts");
    expect(hook).not.toMatch(/from "@\/lib\/session"|crypto-snapshot|portfolio-snapshot|holding-snapshot|ledger/);
    expect(read("src/lib/test-hooks.ts")).not.toContain("feed-freshness");
    expect(read("src/app/status/page.tsx")).toContain("readFeedForce");
    expect(read("src/app/api/ticker/route.ts")).toContain("readFeedForce");
    expect(read("src/components/public/PublicGuide.tsx")).toContain("data-freshness-tone");
    expect(read("src/lib/stock-page-content.ts")).not.toMatch(/last official close/);
    expect(read("src/components/dashboard/MarketWidePerformers.tsx")).not.toMatch(/real-time|official|licensed|live last trade/i);
  });
});
