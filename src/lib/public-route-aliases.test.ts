import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PUBLIC_ROUTE_ALIASES, publicAliasRedirect } from "./public-route-aliases";

function read(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("legacy public routes", () => {
  it("sends the 404 marketing paths to the pages that already work", () => {
    expect(Object.fromEntries(PUBLIC_ROUTE_ALIASES.map((row) => [row.source, row.destination]))).toEqual({
      "/stock-markets": "/markets",
      "/live-results": "/performance",
      "/about-us": "/about",
    });
    expect(publicAliasRedirect("/stock-markets")).toBe("/markets");
    expect(publicAliasRedirect("/live-results/")).toBe("/performance");
    expect(publicAliasRedirect("/about-us")).toBe("/about");
    expect(publicAliasRedirect("/markets")).toBeNull();
  });

  it("wires the aliases into redirects and keeps nav on the working hrefs", () => {
    const config = read("next.config.ts");
    expect(config).toContain("PUBLIC_ROUTE_ALIASES");
    const nav = read("src/components/TopNav.tsx");
    expect(nav).toContain('{ href: "/performance", label: "Example results"');
    expect(nav).not.toContain('href: "/blog"');
    expect(nav).not.toContain("label: \"Live Results\"");
    expect(nav).toContain('{ href: "/markets", label: "Stock Markets"');
    expect(nav).not.toContain('href: "/stock-markets"');
    expect(nav).not.toContain('href: "/live-results"');
    const middleware = read("src/middleware.ts");
    expect(middleware).toContain("publicAliasRedirect");
  });
});
