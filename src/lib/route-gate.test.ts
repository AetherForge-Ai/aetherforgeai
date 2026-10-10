import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { documentAccess } from "@/lib/route-gate";

function read(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("H7 unknown URLs are missing pages", () => {
  it("returns missing for unknown paths and member for real private routes", () => {
    expect(documentAccess("/nope-404")).toBe("missing");
    expect(documentAccess("/dex")).toBe("missing");
    expect(documentAccess("/plans")).toBe("missing");
    expect(documentAccess("/bots")).toBe("missing");
    expect(documentAccess("/sitemap")).toBe("missing");
    expect(documentAccess("/settings")).toBe("member");
    expect(documentAccess("/settings/billing")).toBe("member");
    expect(documentAccess("/headmaster")).toBe("member");
    expect(documentAccess("/billing")).toBe("member");
    expect(documentAccess("/performance")).toBe("public");
    expect(documentAccess("/projections")).toBe("public");
    expect(documentAccess("/blog")).toBe("public");
    expect(documentAccess("/dashboard")).toBe("public");
    expect(documentAccess("/stox")).toBe("public");
    expect(documentAccess("/koins")).toBe("public");
  });

  it("rewrites a missing document to the 404 and keeps legacy redirects", () => {
    const middleware = read("src/middleware.ts");
    expect(middleware).toContain("documentAccess");
    expect(middleware).toContain('missing.pathname = "/__missing"');
    expect(middleware).toContain("NextResponse.rewrite");
    expect(read("src/app/__missing/page.tsx")).toContain("notFound()");
    const notFound = read("src/app/not-found.tsx");
    expect(notFound).toContain('title: { absolute: "Page not found · AetherForge AI" }');
    expect(notFound).toContain('url: "/404"');
    expect(notFound).toContain("canonical: \"/404\"");
    const config = read("next.config.ts");
    expect(config).toContain('source: "/privacy"');
    expect(config).toContain('source: "/how"');
    expect(config).toContain("PUBLIC_ROUTE_ALIASES");
    expect(config).toContain('source: "/billing"');
  });
});
