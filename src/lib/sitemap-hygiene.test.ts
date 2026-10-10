import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import sitemap from "@/app/sitemap";

function read(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("H9 sitemap and robots", () => {
  it("lists lastmod, leaves /projections and /blog off the sitemap", () => {
    const rows = sitemap();
    const byPath = new Map(rows.map((row) => [new URL(row.url).pathname, row]));
    expect(byPath.has("/projections")).toBe(false);
    expect(byPath.has("/blog")).toBe(false);
    expect(byPath.get("/performance")?.changeFrequency).toBe("yearly");
    expect(byPath.get("/performance")?.lastModified).toBe("2026-07-08");
    expect(byPath.get("/")?.lastModified).toBe("2026-10-10");
    for (const row of rows) {
      expect(row.lastModified).toBeTruthy();
    }
    expect(read("src/app/blog/page.tsx")).toContain("index: false");
    expect(read("src/app/robots.ts")).toContain("sitemap:");
    expect(existsSync(path.join(process.cwd(), "public/robots.txt"))).toBe(false);
  });

  it("strips Set-Cookie after the anonymous-cookie clear", () => {
    const middleware = read("src/middleware.ts");
    const clearAt = middleware.indexOf("clearAnonymousAuthCookies");
    const stripAt = middleware.indexOf('if (isCookieFreePath(pathname)) response.headers.delete("set-cookie")');
    expect(clearAt).toBeGreaterThan(0);
    expect(stripAt).toBeGreaterThan(clearAt);
  });
});
