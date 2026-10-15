import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { existsSync, readFileSync } from "node:fs";
import { boardPageCountLine } from "@/lib/stock-markets";
import { resolveSparkQuote } from "@/lib/yahoo-finance";
import { permanentRedirect } from "@/lib/public-route-aliases";
import { isAuthPagePath } from "@/components/TopNav";
import { DATA_TOO_OLD_HOLD, staleDataHold, tradingDaysBetween } from "@/lib/market-intel";
import { formatFeeDeducted } from "@/lib/currency";
import { openDistinctHoldings, usedTickerCount } from "@/lib/entitlements";
import { cleanReportProse, stripMarkdown } from "@/lib/report-prose";
import { csvEscape } from "@/lib/csv-cell";
import { IMPORT_MAX_BYTES, importFileProblem, importTextTooLarge } from "@/lib/import-limits";
import { isFinanceRelevant } from "@/lib/market-news";
import { QUOTE_DELAY_TABLE, QUOTE_DELAY_WORDS } from "@/lib/market-freshness";
import { AI_REQUEST_LINES } from "@/lib/public-copy";

const read = (p: string) => readFileSync(p, "utf8");

describe("H-2 NZX High/Low and one count sentence", () => {
  it("reads day high/low from a v7 spark meta node", () => {
    const q = resolveSparkQuote({ close: [0.38, 0.385], chartPreviousClose: 0.38, dayHigh: 0.39, dayLow: 0.37 });
    expect(q).toMatchObject({ dayHigh: 0.39, dayLow: 0.37 });
  });
  it("the quote path asks v7 spark first", () => {
    expect(read("src/lib/yahoo-finance.ts")).toContain("v7/finance/spark");
  });
  it("the count sentence matches the rows on the page", () => {
    expect(boardPageCountLine({ pageRows: 50, priced: 50, covered: 60, listed: 178, page: 1 })).toBe("Names 1–50 of 60 (178 listed)");
    expect(boardPageCountLine({ pageRows: 10, priced: 8, covered: 60, listed: 178, page: 2 })).toBe(
      "Names 51–60 of 60 (178 listed) · 8 of 10 on this page have a price"
    );
    expect(boardPageCountLine({ pageRows: 12, priced: 12, covered: 12 })).toBe("12 names");
  });
  it("the explorer has no second count string", () => {
    const src = read("src/components/dashboard/MarketsExplorer.tsx");
    expect(src).not.toContain("names on this page`");
    expect(src).not.toContain("prices available for");
  });
});

describe("H-3 priceless coin pages", () => {
  it("301s the three dead slugs", () => {
    expect(permanentRedirect("/markets/crypto/matic-network")).toBe("/markets/crypto/polygon-ecosystem-token");
    expect(permanentRedirect("/markets/crypto/lido-staked-ether")).toBe("/markets/crypto/staked-ether");
    expect(permanentRedirect("/markets/crypto/coinbase-wrapped-btc")).toBe("/markets/crypto/bitcoin");
  });
  it("the sitemap no longer lists matic-network", () => {
    expect(read("src/lib/crypto-vendors.ts")).not.toContain('"matic-network"');
  });
});

describe("H-5 dividends", () => {
  it("duplicate shows Save anyway and Cancel", () => {
    const src = read("src/components/tax/DividendLedgerView.tsx");
    expect(src).toContain("Save anyway");
    expect(src).toContain("Cancel");
  });
  it("delete is confirmed in a dialog", () => {
    expect(read("src/components/dashboard/TransactionsTab.tsx")).toContain("Remove dividend");
  });
});

describe("H-6 report prose", () => {
  it("strips markdown", () => {
    expect(stripMarkdown("**HOLD** and _careful_ now")).toBe("HOLD and careful now");
    expect(cleanReportProse("## Summary\n**Strong Buy** on FPH")).toBe("Summary\nstrongly positive indicator on FPH");
  });
  it("drops Headmaster upsell from Stox/Koins prose", () => {
    const out = cleanReportProse("Cash is 10%. The Headmaster skeleton shows more. Hold steady.");
    expect(out).not.toMatch(/headmaster/i);
    expect(out).toContain("Cash is 10%.");
    expect(cleanReportProse("Headmaster view.", { allowHeadmaster: true })).toContain("Headmaster");
  });
  it("no buy now / sell now / strong buy in bot pages or templates", () => {
    for (const p of ["src/app/buy-the-bots/page.tsx", "src/lib/weekly-email-copy.ts", "src/lib/renewal-reminder.ts"]) {
      if (!existsSync(p)) continue;
      const text = read(p).replace(/const RATING = .*$/m, "");
      expect(text).not.toMatch(/\b(buy now|sell now)\b/i);
    }
  });
});

describe("H-7 plan usage counts distinct open holdings", () => {
  it("counts once per ticker and skips sold-to-zero rows", () => {
    const rows = [
      { ticker: "FPH.NZ", shares: 10 },
      { ticker: "fph.nz", shares: 5 },
      { ticker: "AIR.NZ", shares: 0 },
      { ticker: "MEL.NZ", shares: 3 },
      { ticker: "BTC", asset_type: "crypto", shares: 1 },
    ];
    expect(openDistinctHoldings(rows)).toHaveLength(3);
    expect(usedTickerCount(rows, "stock", "total")).toBe(3);
    expect(usedTickerCount(rows, "stock", "per-bot" as never)).toBe(2);
  });
  it("the plan panel uses the same count", () => {
    expect(read("src/lib/account-plan.ts")).toContain("openDistinctHoldings");
  });
});

describe("H-8 fee sign", () => {
  it("shows a deducted fee with a minus sign", () => {
    expect(formatFeeDeducted(5)).toBe(`−${formatFeeDeducted(5).slice(1)}`);
    expect(formatFeeDeducted(5).startsWith("−")).toBe(true);
    expect(formatFeeDeducted(-5)).toBe(formatFeeDeducted(5));
    expect(formatFeeDeducted(null)).toBe("—");
  });
});

describe("H-10 import safety", () => {
  it("no Math.random in import-commit", () => {
    expect(read("src/lib/import-commit.ts")).not.toContain("Math.random");
  });
  it("5 MB cap and type check", () => {
    expect(importFileProblem({ size: 6 * 1024 * 1024, type: "text/csv", name: "a.csv" })).toMatch(/5 MB/);
    expect(importFileProblem({ size: 100, type: "image/png", name: "a.png" })).toMatch(/CSV/);
    expect(importFileProblem({ size: 100, type: "text/csv", name: "a.csv" })).toBeNull();
    expect(importTextTooLarge("x".repeat(IMPORT_MAX_BYTES + 1))).toBe(true);
  });
  it("escapes formula cells but keeps negative numbers", () => {
    expect(csvEscape("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvEscape("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvEscape("-5.00")).toBe("-5.00");
    expect(csvEscape("+1,234.50")).toBe('"+1,234.50"');
    expect(csvEscape("a,b")).toBe('"a,b"');
  });
});

describe("H-12 data gate, methodology, orphan pages", () => {
  it("counts trading days", () => {
    expect(tradingDaysBetween(new Date("2026-10-09T03:00:00Z"), new Date("2026-10-12T03:00:00Z"))).toBe(1);
  });
  it("holds a ticker whose last print is more than 3 trading days old", () => {
    const row = { score: 70, analysisHold: null as string | null };
    expect(staleDataHold(row, "2026-10-08T03:00:00Z", new Date("2026-10-16T03:00:00Z")).analysisHold).toBe(DATA_TOO_OLD_HOLD);
    expect(staleDataHold(row, "2026-10-14T03:00:00Z", new Date("2026-10-16T03:00:00Z")).analysisHold).toBeNull();
    expect(staleDataHold(row, undefined).score).toBe(70);
  });
  it("own-the-bots/success is gone and methodology exists", () => {
    expect(existsSync("src/app/own-the-bots/success/page.tsx")).toBe(false);
    const page = read("src/app/methodology/page.tsx");
    expect(page).toContain("DATA_TOO_OLD_HOLD");
    expect(page).not.toMatch(/\d+% accura/i);
  });
});

describe("H-13 thin stock pages and news", () => {
  it("stock pages are noindex until the flag is set", () => {
    expect(read("src/app/markets/stock/[ticker]/page.tsx")).toContain("stockPageIndexingEnabled");
  });
  it("drops politics-only stories", () => {
    expect(isFinanceRelevant("Labour party leads latest election poll")).toBe(false);
    expect(isFinanceRelevant("RBNZ holds the OCR as inflation eases")).toBe(true);
    expect(isFinanceRelevant("Fisher & Paykel lifts earnings guidance")).toBe(true);
  });
});

describe("H-14 auth pages", () => {
  it("auth paths render the logged-out header", () => {
    for (const p of ["/login", "/register", "/forgot-password", "/reset-password"]) expect(isAuthPagePath(p)).toBe(true);
    expect(isAuthPagePath("/dashboard")).toBe(false);
  });
  it.each([
    ["src/app/login/page.tsx", "Sign in"],
    ["src/app/register/page.tsx", "Create your account"],
    ["src/app/forgot-password/page.tsx", "Reset your password"],
  ])("%s has the H1 %s and no sr-only duplicate", (file, text) => {
    const src = read(file);
    expect(src).toContain(`>${text}</h1>`);
    expect(src).not.toContain('className="sr-only">');
  });
});

describe("H-15 /returns and /trust", () => {
  it("301 /returns to /refunds; the member page moved", () => {
    expect(permanentRedirect("/returns")).toBe("/refunds");
    expect(permanentRedirect("/returns/")).toBe("/refunds");
    expect(existsSync("src/app/my-returns/page.tsx")).toBe(true);
    expect(read("src/middleware.ts")).toMatch(/permanentRedirect[\s\S]*301/);
  });
  it("trust lists every delay and a real retention statement", () => {
    expect(QUOTE_DELAY_TABLE.map((r) => r.market)).toEqual(["NZX shares", "ASX shares", "US shares", "Crypto"]);
    expect(QUOTE_DELAY_WORDS.NZX).toBe("Delayed ~20 min");
    expect(AI_REQUEST_LINES.join(" ")).not.toContain("do not set a retention period");
    expect(read("src/app/trust/page.tsx")).toContain("TRUST_HOSTING_LINE");
  });
  it("no TODO left on the delay label", () => {
    expect(read("src/lib/market-intel.ts")).not.toMatch(/TODO\(owner\): confirm the US share-price delay/);
  });
});

describe("H-13 sitemap default", () => {
  it("leaves stock pages out of the sitemap while they are noindex", async () => {
    delete process.env.STOCK_PAGE_INDEXING;
    const { publicTickerPaths } = await import("@/lib/sitemap-tickers");
    expect(publicTickerPaths().some((p) => p.startsWith("/markets/stock/"))).toBe(false);
    expect(publicTickerPaths()).not.toContain("/markets/crypto/matic-network");
  });
});

describe("H-2 provider merge keeps High/Low", async () => {
  const { mergeProviderPrints } = await import("@/lib/stock-markets");
  it("a fresh Yahoo print carries dayHigh/dayLow through the merge", () => {
    const out = mergeProviderPrints(
      ["AIR.NZ"],
      { yahoo: { "AIR.NZ": { price: 0.385, changePct: 0, quotedAt: "2026-10-15T04:00:00Z", source: "Yahoo Finance", dayHigh: 0.39, dayLow: 0.38 } }, twelve: null },
      {},
      {}
    );
    expect(out.rows["AIR.NZ"]).toMatchObject({ dayHigh: 0.39, dayLow: 0.38 });
  });
});
