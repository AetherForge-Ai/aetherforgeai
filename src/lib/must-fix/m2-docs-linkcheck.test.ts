/** b64 M-2: /docs has 6+ guides, each with a real screenshot file, and every internal docs/help link resolves to a route. */
import { describe, expect, it } from "vitest";
import { existsSync, statSync } from "node:fs";
import { DOCS_GUIDES, docsShot } from "@/lib/docs-guides";
import { DOC_LINKS } from "@/lib/help-index";

function routeExists(href: string): boolean {
  const path = href.split(/[?#]/)[0].replace(/\/$/, "") || "/";
  if (path.startsWith("/docs/")) return DOCS_GUIDES.some((g) => `/docs/${g.slug}` === path);
  if (existsSync(`public${path}`)) return true;
  const dir = `src/app${path === "/" ? "" : path}`;
  return ["page.tsx", "page.ts", "route.ts"].some((f) => existsSync(`${dir}/${f}`));
}

describe("M-2 docs", () => {
  it("6+ guides, each with a screenshot on disk", () => {
    expect(DOCS_GUIDES.length).toBeGreaterThanOrEqual(6);
    for (const g of DOCS_GUIDES) {
      const shot = docsShot(g.slug);
      expect(shot, g.slug).not.toBeNull();
      expect(statSync(`public${shot!.src}`).size, g.slug).toBeGreaterThan(10_000);
      expect(shot!.alt.length).toBeGreaterThan(20);
    }
  });
  it("no broken internal links on /docs", () => {
    const broken = DOC_LINKS.map((l) => l.href).filter((h) => h.startsWith("/") && !routeExists(h));
    expect(broken).toEqual([]);
  });
});
