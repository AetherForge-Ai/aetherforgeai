import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("public surface routes", () => {
  it("does not hide About sections until an intersection observer runs", () => {
    const about = read("src/components/about/AboutContent.tsx");
    expect(about).not.toContain("translate-y-6 opacity-0");
    expect(about).not.toContain("new IntersectionObserver");
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
    expect(middleware).toContain('"/market-news"');
    expect(read("src/app/blog/page.tsx")).toContain("no articles");
  });

  it("uses the shared site header on About and prompts signed-out dashboard clicks", () => {
    const about = read("src/components/about/AboutContent.tsx");
    expect(about).toContain("SiteHeader");
    expect(about).not.toContain("Try the AI");
    expect(about).not.toContain("Toggle menu");
    const prompt = read("src/components/dashboard/MemberDashboardPrompt.tsx");
    expect(prompt).toContain(
      "Dashboard is part of the service available to signed up members — You can sign up right now for free by clicking the link",
    );
    expect(prompt).toContain('"/pricing"');
    expect(read("src/components/TopNav.tsx")).toContain("onDashboardClick");
    expect(read("src/components/home/HomeSessionCtas.tsx")).toContain("onDashboardClick");
    expect(read("src/components/dashboard/GuestDashboardGate.tsx")).toContain("MemberDashboardDialog");
    expect(read("src/components/dashboard/GuestDashboardGate.tsx")).not.toContain("Test UserAF");
  });
});
