import { describe, expect, it } from "vitest";
import { priceBadge } from "@/lib/price-confidence";

const NOW = new Date("2026-10-10T02:00:00.000Z");
const RECENT = new Date(NOW.getTime() - 5 * 60 * 1000);

describe("price confidence", () => {
  it("goes amber on a killed feed and red on the next refresh", () => {
    const source = "Public market data (Yahoo Finance)";
    const delay = "Delayed, not a direct NZX or ASX feed";
    const healthy = priceBadge({
      source,
      delay,
      quotedAt: RECENT,
      now: NOW,
      refreshOk: true,
      failedRefreshes: 0,
    });
    const killed = priceBadge({
      source,
      delay,
      quotedAt: RECENT,
      now: NOW,
      refreshOk: false,
      failedRefreshes: 1,
    });
    const again = priceBadge({
      source,
      delay,
      quotedAt: RECENT,
      now: NOW,
      refreshOk: false,
      failedRefreshes: 2,
    });
    const empty = priceBadge({
      source,
      delay,
      quotedAt: null,
      now: NOW,
      refreshOk: false,
      failedRefreshes: 1,
    });

    expect(healthy.tone).toBe("green");
    expect(healthy.why).toBe("");
    expect(killed.tone).toBe("amber");
    expect(killed.why).toContain("previous print");
    expect(again.tone).toBe("red");
    expect(empty.tone).toBe("red");
    expect(empty.why).toContain("No quote");

    const blob = [healthy, killed, again, empty]
      .map((badge) => `${badge.source} ${badge.delay} ${badge.why}`)
      .join("\n");
    expect(blob).not.toMatch(/\breal-time\b|\bofficial\b|\blicensed\b/i);
    expect(healthy.source).toContain("Yahoo Finance");
    expect(healthy.delay).toContain("not a direct NZX or ASX feed");
    expect(healthy.updated).toBe(RECENT.toISOString());
  });
});
