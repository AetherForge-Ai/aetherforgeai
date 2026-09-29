import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("public surface routes", () => {
  it("does not hide About sections until an intersection observer runs", () => {
    const about = read("src/components/about/AboutContent.tsx");
    expect(about).not.toContain("opacity-0");
    expect(about).not.toContain("IntersectionObserver");
    expect(about).toContain("Who We Are");
    expect(about).toContain("Send us a message");
  });

  it("publishes /docs and /blog as public pages in middleware and the sitemap", () => {
    const middleware = read("src/middleware.ts");
    const sitemap = read("src/app/sitemap.ts");
    for (const route of ['"/docs"', '"/blog"']) {
      expect(middleware).toContain(route);
      expect(sitemap).toContain(route);
    }
    expect(read("src/app/docs/page.tsx")).toContain("/how-it-works");
    expect(read("src/app/docs/page.tsx")).toContain("/ai-disclaimer");
    expect(read("src/app/docs/page.tsx")).toContain("/pricing#faq");
    expect(read("src/app/blog/page.tsx")).toContain("/market-news");
    expect(read("src/app/blog/page.tsx")).toContain("no articles");
  });
});
