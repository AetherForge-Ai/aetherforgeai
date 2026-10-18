/**
 * H-12: stale prices become Hold, with the age, and the test hook stays private.
 */
import { existsSync, readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeSecurity, staleDataHold } from "@/lib/market-intel";
import { labelIntel } from "@/lib/security-signal";
import { buildLiveReport } from "@/lib/bot-report";
import { renderReportHtml } from "@/lib/report-html";
import { documentAccess } from "@/lib/route-gate";
import {
  HOLD_LIMITS,
  botFacingWord,
  forcedStalePrintIso,
  holdLimitLine,
  scrubBotCopy,
  staleHoldDecision,
} from "@/lib/bot-hold-gate";
import { isStaleTickerName, nextStaleTickerList, parseStaleTickerList } from "@/lib/stale-ticker-hook";

const read = (path: string) => readFileSync(path, "utf8");
const NOW = new Date("2026-10-16T03:00:00Z");

function closes(last = 36): number[] {
  return Array.from({ length: 40 }, (_, index) => last - 1 + index * 0.02);
}

describe("H-12 Hold limits", () => {
  it("names a different limit for each market", () => {
    expect(HOLD_LIMITS.nzx).toMatchObject({ kind: "trading-days", limit: 1 });
    expect(HOLD_LIMITS.asx).toMatchObject({ kind: "trading-days", limit: 1 });
    expect(HOLD_LIMITS.us).toMatchObject({ kind: "trading-days", limit: 2 });
    expect(HOLD_LIMITS.crypto).toMatchObject({ kind: "minutes", limit: 15 });
    expect(holdLimitLine("us")).toBe("US shares: older than 2 trading days.");
    expect(holdLimitLine("crypto")).toBe("Crypto: older than 15 minutes.");
  });

  it("holds NZX and ASX after one trading day and still rates the latest close", () => {
    const stale = staleHoldDecision("nzx", "2026-10-14T03:00:00Z", NOW);
    expect(stale.held).toBe(true);
    if (stale.held) {
      expect(stale.text.startsWith("Hold: data too old")).toBe(true);
      expect(stale.text).toContain("2 trading days old");
      expect(stale.text).toContain("NZX shares stay on Hold");
      expect(stale.text).not.toMatch(/\b(buy|sell)(?:s|ing)?\b/i);
    }
    expect(staleHoldDecision("asx", "2026-10-14T03:00:00Z", NOW).held).toBe(true);
    expect(staleHoldDecision("nzx", "2026-10-15T03:00:00Z", NOW).held).toBe(false);
    expect(staleHoldDecision("nzx", "not-a-date", NOW).held).toBe(false);
  });

  it("gives US shares one extra trading day", () => {
    expect(staleHoldDecision("us", "2026-10-14T03:00:00Z", NOW).held).toBe(false);
    const stale = staleHoldDecision("us", "2026-10-13T03:00:00Z", NOW);
    expect(stale.held).toBe(true);
    if (stale.held) expect(stale.text).toContain("3 trading days old");
  });

  it("holds crypto after 15 minutes and states the age in minutes", () => {
    const fresh = new Date(NOW.getTime() - 10 * 60_000);
    const old = new Date(NOW.getTime() - 20 * 60_000);
    expect(staleHoldDecision("crypto", fresh, NOW).held).toBe(false);
    const stale = staleHoldDecision("crypto", old, NOW);
    expect(stale.held).toBe(true);
    if (stale.held) {
      expect(stale.text).toContain("20 minutes old");
      expect(stale.text).toContain("older than 15 minutes");
    }
  });
});

describe("H-12 bot output", () => {
  it("shows Hold text instead of a signal when the Stox price is stale", () => {
    const series = closes();
    const row = analyzeSecurity("FPH.NZ", series[series.length - 1], "Fisher & Paykel Healthcare", "NZX", series);
    const held = labelIntel(staleDataHold(row, "2026-10-08T03:00:00Z", NOW, "nzx"));
    const report = buildLiveReport("stock", [{ ticker: "FPH.NZ", name: "Fisher & Paykel Healthcare", price: row.price }], {
      holdingIntel: [held],
    });
    expect(report.tickers[0]?.signal).toBe("Hold");
    expect(report.tickers[0]?.note).toMatch(/^Hold: data too old/);
    expect(report.tickers[0]?.note).toMatch(/trading days old/);
    expect(report.tickers[0]?.signal).not.toMatch(/buy|sell/i);
    expect(report.directRecommendations[0]?.action).toBe("HOLD");
    expect(report.directRecommendations[0]?.detail).toBe(report.tickers[0]?.note);
    const html = renderReportHtml(report, { generatedAtLabel: "16 Oct 2026" });
    expect(html).toContain("Hold: data too old");
    expect(html).not.toMatch(/\b(buy|sell)(?:s|ing)?\b/i);
  });

  it("shows Hold text for a stale Koins price", () => {
    const series = closes(2);
    const row = analyzeSecurity("BTC", series[series.length - 1], "Bitcoin", "CRYPTO", series);
    const held = labelIntel(staleDataHold(row, new Date(NOW.getTime() - 40 * 60_000), NOW, "crypto"));
    const report = buildLiveReport("crypto", [{ ticker: "BTC", name: "Bitcoin", price: row.price }], {
      holdingIntel: [held],
    });
    expect(report.tickers[0]?.signal).toBe("Hold");
    expect(report.tickers[0]?.note).toContain("minutes old");
    expect(report.tickers[0]?.note).not.toMatch(/\b(buy|sell)(?:s|ing)?\b/i);
    const html = renderReportHtml(report, { generatedAtLabel: "16 Oct 2026" });
    expect(html).toContain("Hold: data too old");
    expect(html).not.toMatch(/\b(buy|sell)(?:s|ing)?\b/i);
  });

  it("removes buy and sell wording from the rest of the bot copy", () => {
    expect(scrubBotCopy("Buy FPH.NZ. Sell AIR.NZ. Hold the cash.")).toBe(
      "Positive signal FPH.NZ. Negative signal AIR.NZ. Hold the cash."
    );
    expect(scrubBotCopy("Hold: data too old. The last price is 2 trading days old.")).toMatch(/^Hold: data too old/);
    expect(botFacingWord("Sell")).toBe("Negative signal");
    expect(botFacingWord("Buy", "Hold: data too old. The last price is 2 trading days old.")).toBe("Hold");
  });
});

describe("H-12 stale ticker hook", () => {
  it("adds a ticker and then resets it", () => {
    expect(nextStaleTickerList([], "fph.nz", false)).toEqual(["FPH.NZ"]);
    expect(nextStaleTickerList(["FPH.NZ", "BTC"], "FPH.NZ", true)).toEqual(["BTC"]);
    expect(nextStaleTickerList(["FPH.NZ"], "", true)).toEqual([]);
    expect(nextStaleTickerList(["FPH.NZ"], "not a ticker", false)).toEqual(["FPH.NZ"]);
    expect(parseStaleTickerList("btc,BTC,eth")).toEqual(["BTC", "ETH"]);
    expect(isStaleTickerName("AIR.NZ")).toBe(true);
    const forced = forcedStalePrintIso("crypto", NOW);
    expect(staleHoldDecision("crypto", forced, NOW).held).toBe(true);
    expect(staleHoldDecision("nzx", forcedStalePrintIso("nzx", NOW), NOW).held).toBe(true);
  });

  it("lives in its own file and stays 404 unless the test gate is open", () => {
    const hook = read("src/lib/stale-ticker-hook.ts");
    const route = read("src/app/api/test-hooks/stale-ticker/route.ts");
    const page = read("src/app/test-hooks/stale-ticker/page.tsx");
    expect(read("src/lib/test-hooks.ts")).not.toContain("af_test_stale_tickers");
    expect(hook).toContain("currentUserMayUseTestHooks");
    expect(route).toContain("currentUserMayUseTestHooks");
    expect(route).toContain("status: 404");
    expect(page).toContain("notFound()");
    expect(documentAccess("/test-hooks/stale-ticker")).toBe("test-hooks");
    expect(documentAccess("/own-the-bots/success")).toBe("missing");
    expect(documentAccess("/own-the-bots/success/")).toBe("missing");
    expect(existsSync("src/app/own-the-bots/success/page.tsx")).toBe(false);
  });
});

describe("H-12 methodology", () => {
  it("keeps the backtest method and bad periods, and does not invent results", () => {
    const page = read("src/app/methodology/page.tsx");
    expect(page).toContain("Results not published yet");
    expect(page).toContain("Mar 2020");
    expect(page).toContain("2022 rate-rise");
    expect(page).toContain("DATA_TOO_OLD_HOLD");
    expect(page).toContain("holdLimitLine");
    expect(page).not.toMatch(/hit rate of \d/i);
    expect(page).not.toContain("Results: —");
  });
});

const gate = vi.hoisted(() => ({ allow: false }));
const jar = vi.hoisted(() => ({ value: "" }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/test-hooks.server", () => ({
  currentUserMayUseTestHooks: async () => gate.allow,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (jar.value ? { value: jar.value } : undefined),
  }),
}));

describe("H-12 stale ticker route", () => {
  beforeEach(() => {
    gate.allow = false;
    jar.value = "";
  });

  it("answers 404 when the caller is not an allow-listed test account", async () => {
    const { GET, POST } = await import("@/app/api/test-hooks/stale-ticker/route");
    expect((await GET()).status).toBe(404);
    const posted = await POST(
      new Request("http://localhost/api/test-hooks/stale-ticker", {
        method: "POST",
        body: JSON.stringify({ ticker: "FPH.NZ" }),
      })
    );
    expect(posted.status).toBe(404);
  });

  it("forces a ticker stale and then resets it for an allow-listed account", async () => {
    gate.allow = true;
    const { GET, POST } = await import("@/app/api/test-hooks/stale-ticker/route");
    const posted = await POST(
      new Request("http://localhost/api/test-hooks/stale-ticker", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticker: "fph.nz" }),
      })
    );
    expect(posted.status).toBe(200);
    const body = (await posted.json()) as { stale: string[] };
    expect(body.stale).toEqual(["FPH.NZ"]);
    expect(posted.cookies.get("af_test_stale_tickers")?.value).toBe("FPH.NZ");

    jar.value = "FPH.NZ,BTC";
    const listed = (await (await GET()).json()) as { stale: string[] };
    expect(listed.stale).toEqual(["FPH.NZ", "BTC"]);

    const reset = await POST(
      new Request("http://localhost/api/test-hooks/stale-ticker", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticker: "FPH.NZ", reset: true }),
      })
    );
    const resetBody = (await reset.json()) as { stale: string[]; reset: boolean };
    expect(resetBody.reset).toBe(true);
    expect(resetBody.stale).toEqual(["BTC"]);
  });
});
