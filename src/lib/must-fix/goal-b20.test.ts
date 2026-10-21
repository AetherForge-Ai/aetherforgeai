// pull-check:v3-goal-b20-2026-10-18
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { readFileSync } from "node:fs";
import { testHooksAllowedFor, feedOffFromCookieHeader, parseSimulate } from "@/lib/test-hooks";
import { documentAccess } from "@/lib/route-gate";
import { tableErrorDetail } from "@/lib/ip-rate-limit";
import { inferMarket } from "@/lib/market-news";
import { importOversells } from "@/lib/import-oversell";

const read = (p: string) => readFileSync(p, "utf8");

describe("Goal b20", () => {
  it("pins the build", () => expect(read("public/build-version.txt").trim()).toMatch(/^v3-(?:goal|restore)-b\d+[a-z]?-2026-10-\d\d$/));

  it("SECURITY: hooks need GOAL_TEST_HOOKS=1 and an allow-listed account", () => {
    const on = { GOAL_TEST_HOOKS: "1" };
    expect(testHooksAllowedFor({ _id: "u1", email: "a@example.invalid" }, {})).toBe(false);
    expect(testHooksAllowedFor({ _id: "u1", email: "a@example.invalid" }, { GOAL_TEST_HOOKS: "0" })).toBe(false);
    expect(testHooksAllowedFor({ _id: "u1", email: "a@example.invalid" }, on)).toBe(false); // b24: no domain allow-list
    expect(testHooksAllowedFor({ _id: "u1", email: "member@gmail.com" }, on)).toBe(false);
    expect(testHooksAllowedFor({ _id: "u1", email: "a@evil-example.invalid.com" }, on)).toBe(false);
    expect(testHooksAllowedFor({ _id: "u9", email: "member@gmail.com" }, { ...on, GOAL_TEST_HOOK_USER_IDS: "u8,u9" })).toBe(true);
    expect(testHooksAllowedFor(null, on)).toBe(false);
    expect(parseSimulate("AIR.NZ:1:2", false)).toEqual([]);
    expect(feedOffFromCookieHeader("af_test_feed_off=1", false)).toBe(false);
  });

  it("SECURITY: /test-hooks is not public; routes check the gate server-side", () => {
    expect(documentAccess("/test-hooks")).toBe("test-hooks");
    expect(documentAccess("/test-hooks/dashboard-500")).toBe("test-hooks");
    expect(read("src/lib/route-gate.ts")).not.toMatch(/^\s*"\/test-hooks",/m);
    expect(read("src/app/test-hooks/page.tsx")).toMatch(/notFound\(\)/);
    expect(read("src/app/test-hooks/dashboard-500/page.tsx")).toMatch(/notFound\(\)/);
    expect(read("src/app/api/ticker/route.ts")).toMatch(/currentUserMayUseTestHooks/);
    expect(read("src/app/api/watches/route.ts")).toMatch(/testHooksAllowedFor/);
    expect(read("src/app/api/transactions/route.ts")).toMatch(/assumeHoldings[\s\S]*testHooksAllowedFor/);
  });

  it("G-23: /learn and /compare are public", () => {
    expect(documentAccess("/learn")).toBe("public");
    expect(documentAccess("/learn/pir-rates")).toBe("public");
    expect(documentAccess("/compare/sharesight")).toBe("public");
  });

  it("CR-2: table error detail is trimmed and redacted; cron secret is headers only", () => {
    const d = tableErrorDetail(new Error(`400 field bucket_key invalid; token=abcd1234 https://api.example/x?k=1 ${["sk", "test", "X".repeat(24)].join("_")} a@b.co`));
    expect(d.length).toBeLessThanOrEqual(80);
    expect(d).toMatch(/bucket_key invalid/);
    expect(d).not.toMatch(/abcd1234|https?:|sk_test|a@b\.co|;/);
    expect(read("src/app/api/cron/track-record/route.ts")).not.toMatch(/searchParams\.get\("key"\)/);
  });

  it("H-13: PLS Group (ASX) is tagged ASX, not Global", () => {
    expect(inferMarket("PLS Group shares jump as lithium price recovers")).toBe("ASX");
    expect(read("src/lib/market-news.ts")).toMatch(/raw\.marketHint !== "Global"/);
  });

  it("G-10: writes are authoritative and Save anyway sends the override", () => {
    // b31 G-10: optimistic paint again, but the dialog stays open until the server answers and a refusal rolls back.
    expect(read("src/components/dashboard/RecordTransactionPanel.tsx")).toMatch(/const optimistic = (false|true)/);
    expect(read("src/components/tax/DividendLedgerView.tsx")).toMatch(/allow_duplicate: true/);
    const route = read("src/app/api/transactions/route.ts");
    expect(route).toMatch(/delete-unconfirmed/);
    expect(route).toMatch(/readFailed/);
  });

  it("G-24: review flags an oversell walked in date order", () => {
    const f = importOversells(
      [
        { line: 1, ticker: "SPK.NZ", side: "Buy", quantity: 10, date: "2026-10-01" },
        { line: 2, ticker: "SPK.NZ", side: "Sell", quantity: 10, date: "2026-10-02" },
        { line: 3, ticker: "AIR.NZ", side: "Sell", quantity: 100, date: "2026-10-02" },
      ],
      { "AIR.NZ": 30 }
    );
    expect(f[2]).toBeUndefined();
    expect(f[3]).toMatch(/^You hold 30 AIR.NZ/);
  });

  it("G-29: Xero export shows on /tax and in the mobile menu with a Free lock", () => {
    expect(read("src/components/tax/TaxPageContent.tsx")).toMatch(/CSV export: Starter and above \(Xero CSV\)/);
    expect(read("src/components/dashboard/PortfolioDashboard.tsx").match(/data-xero-export/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
