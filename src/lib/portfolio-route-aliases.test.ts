import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import nextConfig from "../../next.config";
import { middleware } from "../middleware";
import { PORTFOLIO_ROUTE_ALIASES, portfolioAliasRedirect, portfolioAliasStatus } from "./portfolio-route-aliases";

describe("portfolio route aliases", () => {
  it("sends the urgent 404s to existing portfolio surfaces", () => {
    expect(Object.fromEntries(PORTFOLIO_ROUTE_ALIASES.map((row) => [row.source, row.destination]))).toEqual({
      "/transactions": "/dashboard?tab=transactions",
      "/ledger": "/dashboard?tab=transactions",
      "/alerts": "/dashboard/alerts",
      "/notifications": "/dashboard/alerts",
    });
    expect(portfolioAliasRedirect("/notifications")).toBe("/dashboard/alerts");
    expect(portfolioAliasRedirect("/alerts/")).toBe("/dashboard/alerts");
  });
});

describe("b61 TT P2: /ledger is exactly one 308 hop", () => {
  it("middleware answers /ledger with a single 308 to the Transactions tab", async () => {
    for (const path of ["/ledger", "/ledger/"]) {
      const res = await middleware(new NextRequest(`https://aetherforgeai.co.nz${path}`));
      expect(res.status).toBe(308);
      const loc = new URL(res.headers.get("location")!);
      expect(loc.pathname).toBe("/dashboard");
      expect(loc.search).toBe("?tab=transactions");
      // the destination is the final page: it is not itself an alias (no second hop)
      expect(portfolioAliasRedirect(loc.pathname)).toBeNull();
    }
    expect(portfolioAliasStatus("/ledger")).toBe(308);
  });

  it("next.config redirects for /ledger match the middleware (permanent, same destination)", async () => {
    const rows = await nextConfig.redirects!();
    const ledger = rows.filter((r) => r.source === "/ledger");
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ destination: "/dashboard?tab=transactions", permanent: true });
    expect(rows.some((r) => r.source === "/dashboard" )).toBe(false);
  });
});
