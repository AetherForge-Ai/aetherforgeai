// CRAWL-C: F6 sitemap coverage, F7 lastmod, F9 robots.txt.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveRobots } from "next/dist/build/webpack/loaders/metadata/resolve-route-data";
import sitemap from "@/app/sitemap";
import robots from "@/app/robots";
import { DOCS_GUIDES } from "@/lib/docs-guides";
import { DOC_LINKS } from "@/lib/help-index";
import { LEGAL_PAGES, latestLegalVersion, legalStampToIso, type LegalPageKey } from "@/lib/legal-history";
import { documentAccess } from "@/lib/route-gate";

function read(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

const CRAWL_PATHS = [
  "/start-here",
  "/legal/archive",
  "/docs/record-a-trade",
  "/docs/edit-or-delete-a-row",
  "/docs/import-a-csv",
  "/docs/read-price-freshness",
  "/docs/run-a-report",
  "/docs/export-your-ledger",
  "/docs/income-and-tax-view",
];

const STAY_OUT = [
  "/my-returns",
  "/projections",
  "/blog",
  "/dashboard",
  "/settings",
  "/account",
  "/import",
  "/offline",
  "/onboarding",
  "/shared",
  "/admin",
  "/tax/dividends",
  "/tax/income",
  "/tax/fif",
  "/tax/realised",
  "/tax/ir3",
  "/login",
  "/register",
];

describe("CRAWL-C F6 sitemap coverage", () => {
  const paths = sitemap().map((row) => new URL(row.url).pathname);

  it("lists every public docs guide from the same source as the /docs index", () => {
    expect(read("src/app/docs/page.tsx")).toContain("DOCS_GUIDES");
    expect(read("src/app/sitemap.ts")).toContain("DOCS_GUIDES");
    expect(DOCS_GUIDES.length).toBeGreaterThanOrEqual(7);
    for (const guide of DOCS_GUIDES) {
      const href = `/docs/${guide.slug}`;
      expect(documentAccess(href)).toBe("public");
      expect(paths, href).toContain(href);
    }
    for (const href of CRAWL_PATHS) expect(paths, href).toContain(href);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("leaves member-only and noindex pages out, including docs-index links to them", () => {
    for (const href of STAY_OUT) expect(paths, href).not.toContain(href);
    for (const link of DOC_LINKS) {
      const href = link.href.split(/[?#]/)[0] || "/";
      if (documentAccess(href) === "member") expect(paths, href).not.toContain(href);
      const file = `src/app${href === "/" ? "" : href}/page.tsx`;
      try {
        if (/index:\s*false/.test(read(file))) expect(paths, href).not.toContain(href);
      } catch {
        // No page file for this href.
      }
    }
  });
});

describe("CRAWL-C F7 lastmod", () => {
  const byPath = new Map(sitemap().map((row) => [new URL(row.url).pathname, row]));

  it("uses the legal stamp the page prints", () => {
    expect(legalStampToIso("16 Oct 2026")).toBe("2026-10-16");
    expect(legalStampToIso("13 Oct 2026")).toBe("2026-10-13");
    expect(read("src/components/legal/LegalShell.tsx")).toContain("const stamp = latest?.date ?? updated");
    for (const key of Object.keys(LEGAL_PAGES) as LegalPageKey[]) {
      const page = LEGAL_PAGES[key];
      expect(latestLegalVersion(key).date).toBe("16 Oct 2026");
      expect(byPath.get(page.href)?.lastModified).toBe(legalStampToIso(latestLegalVersion(key).date));
      expect(byPath.get(page.href)?.lastModified).toBe("2026-10-16");
    }
    expect(read("src/app/legal/archive/page.tsx")).toContain("updated={LEGAL_PAGES.terms.versions[0].date}");
    expect(byPath.get("/legal/archive")?.lastModified).toBe(legalStampToIso(LEGAL_PAGES.terms.versions[0].date));
  });

  it("omits lastmod on live price pages", () => {
    expect(byPath.get("/markets")?.lastModified).toBeUndefined();
    expect(byPath.get("/market-news")?.lastModified).toBeUndefined();
    expect(byPath.get("/markets")?.changeFrequency).toBe("weekly");
    expect(byPath.get("/market-news")?.changeFrequency).toBe("weekly");
    const tickers = [...byPath.keys()].filter((path) => path.startsWith("/markets/"));
    expect(tickers.length).toBeGreaterThan(0);
    for (const path of tickers) expect(byPath.get(path)?.lastModified, path).toBeUndefined();
  });
});

describe("CRAWL-C F9 robots.txt", () => {
  it("emits one * group, no Host line, and the Disallow rules", () => {
    const body = robots();
    expect(body).not.toHaveProperty("host");
    expect(read("src/app/robots.ts")).not.toMatch(/\bhost\s*:/);
    const text = resolveRobots(body);
    expect(text.match(/^User-Agent:.*$/gm)).toEqual(["User-Agent: *"]);
    expect(text).not.toMatch(/^Host:/m);
    expect(text).toContain("Sitemap: ");
    expect(String(body.sitemap)).toMatch(/\/sitemap\.xml$/);
    const rule = Array.isArray(body.rules) ? body.rules[0] : body.rules;
    expect(rule.userAgent).toBe("*");
    expect(rule.disallow).toEqual(["/api/", "/dashboard", "/settings", "/account", "/stripe/", "/import"]);
    for (const path of rule.disallow as string[]) expect(text).toContain(`Disallow: ${path}`);
  });
});
