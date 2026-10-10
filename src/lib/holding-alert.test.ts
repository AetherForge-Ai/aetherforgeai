import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyUnsubscribe, composeWatchNotices, type WatchAlert, type WatchQuote } from "@/lib/holding-alert";

function read(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

const quote: WatchQuote = {
  price: 1.1,
  changePct: 6,
  source: "Public market data (Yahoo Finance), delayed",
  asOf: "2026-10-10T01:00:00.000Z",
};

describe("holding alerts", () => {
  it("composes three notices with source, time and unsubscribe, and does not send", () => {
    const alerts: WatchAlert[] = [
      { id: "price", ticker: "AIR.NZ", kind: "price_level", status: "active", level: 1, side: "above" },
      { id: "move", ticker: "AIR.NZ", kind: "percent_move", status: "active", movePct: 5 },
      { id: "ex", ticker: "AIR.NZ", kind: "ex_dividend", status: "active", exDate: "2026-10-10" },
      { id: "news", ticker: "AIR.NZ", kind: "news", status: "active", headline: "Example headline supplied with the refresh." },
    ];
    const notices = composeWatchNotices({
      alerts,
      quotes: { "AIR.NZ": quote },
      now: new Date("2026-10-10T01:00:00.000Z"),
      today: "2026-10-10",
    });
    expect(notices).toHaveLength(4);
    expect(notices.map((notice) => notice.kind)).toEqual(["price_level", "percent_move", "ex_dividend", "news"]);
    for (const notice of notices) {
      expect(notice.sent).toBe(false);
      expect(notice.text).toContain(quote.source);
      expect(notice.text).toContain(quote.asOf);
      expect(notice.text).toContain("Unsubscribe:");
      expect(notice.text).toContain("not a recommendation");
      expect(notice.text).not.toMatch(/you should|we recommend/i);
    }
    const paused = applyUnsubscribe(alerts, "price");
    const after = composeWatchNotices({
      alerts: paused,
      quotes: { "AIR.NZ": quote },
      now: new Date("2026-10-10T01:00:00.000Z"),
      today: "2026-10-10",
    });
    expect(after.map((notice) => notice.id)).toEqual(["move", "ex", "news"]);

    const held = composeWatchNotices({
      alerts,
      quotes: { "AIR.NZ": quote },
      now: new Date("2026-10-10T12:30:00.000Z"),
      today: "2026-10-10",
    });
    expect(held[0].quiet).toBe(true);
    expect(held[0].sent).toBe(false);
    expect(held[0].text).toContain("held");

    const src = read("src/lib/holding-alert.ts");
    expect(src).not.toMatch(/sendTransactionalEmail|nodemailer|fetch\(/);
    expect(src).toContain("pull-check:batch2-2026-10-11 B2-8");
  });
});
