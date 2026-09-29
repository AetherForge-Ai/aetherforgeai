import { describe, expect, it } from "vitest";
import { PORTFOLIO_ROUTE_ALIASES } from "./portfolio-route-aliases";

describe("portfolio route aliases", () => {
  it("sends the three urgent 404s to existing portfolio surfaces", () => {
    expect(Object.fromEntries(PORTFOLIO_ROUTE_ALIASES.map((row) => [row.source, row.destination]))).toEqual({
      "/transactions": "/dashboard/transactions",
      "/alerts": "/dashboard/alerts",
      "/notifications": "/dashboard/alerts",
    });
  });
});
