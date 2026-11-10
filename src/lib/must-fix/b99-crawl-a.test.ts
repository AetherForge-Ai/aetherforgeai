/**
 * CRAWL-A (11 Nov 2026 live crawl): one <main> per route, no signed-out
 * /pricing 401, no internal /portfolio links, one dashboard H1 in the first HTML.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import nextConfig from "../../../next.config";
import { middleware } from "../../middleware";
import { DashboardSessionShell } from "@/components/dashboard/DashboardSessionShell";
import { dashboardPageTitle, type DashboardView } from "@/components/dashboard/PortfolioDashboard";
import { CHANGELOG_ENTRIES } from "@/lib/changelog-entries";
import { gsc404Redirect } from "@/lib/gsc-404-redirects";
import { portfolioAliasRedirect, portfolioAliasStatus } from "@/lib/portfolio-route-aliases";
import { permanentRedirect, publicAliasRedirect } from "@/lib/public-route-aliases";
import { documentAccess } from "@/lib/route-gate";

const read = (file: string) => readFileSync(file, "utf8");

/** Pages the crawl saw with two <main> landmarks, plus every other nested main found in the app. */
const ONE_MAIN_PAGES: ReadonlyArray<readonly [route: string, file: string]> = [
  ["/", "src/app/page.tsx"],
  ["/demo", "src/app/demo/page.tsx"],
  ["/trust", "src/app/trust/page.tsx"],
  ["/methodology", "src/app/methodology/page.tsx"],
  ["/help", "src/app/help/page.tsx"],
  ["/start-here", "src/app/start-here/page.tsx"],
  ["/my-returns", "src/app/my-returns/page.tsx"],
  ["/markets", "src/app/markets/page.tsx"],
  ["/markets", "src/components/markets/MarketsAccountPending.tsx"],
  ["/dashboard/goals", "src/app/dashboard/goals/page.tsx"],
  ["/admin", "src/app/admin/page.tsx"],
  ["/offline", "src/app/offline/page.tsx"],
  ["/share/accept", "src/app/share/accept/page.tsx"],
  ["/dashboard/performance", "src/components/dashboard/PerformancePanel.tsx"],
  ["/dashboard/brief", "src/components/briefs/MondayBriefPanel.tsx"],
  ["/dashboard/alerts", "src/components/briefs/AlertsV1Panel.tsx"],
  ["/test-hooks", "src/components/TestHooksPanel.tsx"],
  ["/test-hooks/paid-features", "src/app/test-hooks/paid-features/page.tsx"],
  ["/test-hooks/stale-ticker", "src/app/test-hooks/stale-ticker/page.tsx"],
  ["/test-hooks/track-record", "src/app/test-hooks/track-record/page.tsx"],
  ["/test-hooks/feed-freshness", "src/components/FeedFreshnessHookPanel.tsx"],
  ["/test-hooks/dashboard-500", "src/components/dashboard/Fixture500Client.tsx"],
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

describe("CRAWL-A F1: exactly one <main> on every route", () => {
  it("enumerates the nested-main pages and leaves only the layout landmark", () => {
    expect(ONE_MAIN_PAGES.map(([route]) => route)).toEqual(expect.arrayContaining([
      "/",
      "/demo",
      "/trust",
      "/methodology",
      "/help",
      "/start-here",
      "/my-returns",
    ]));
    for (const [route, file] of ONE_MAIN_PAGES) {
      expect(read(file), route).not.toMatch(/<main[\s>/]/);
      expect(read(file), route).not.toMatch(/<\/main>/);
    }
    const layout = read("src/app/layout.tsx");
    expect(layout.match(/<main[\s>/]/g)).toEqual(['<main ']);
    expect(layout).toContain('<main id="main" className="min-w-0 flex-1">');
    const offenders = walk("src")
      .filter((file) => file.endsWith(".tsx") && !file.endsWith(".test.tsx"))
      .filter((file) => read(file).includes("<main"));
    expect(offenders.map((file) => file.split(path.sep).join("/"))).toEqual(["src/app/layout.tsx"]);
  });
});

describe("CRAWL-A F2: signed-out /pricing does not call /api/account/plan", () => {
  it("the pricing gate fetches only for a member document", () => {
    const gate = read("src/components/pricing/SubscriberGate.tsx");
    const guard = gate.indexOf('if (mode !== "member") return;');
    const fetchAt = gate.indexOf('fetch("/api/account/plan"');
    expect(guard).toBeGreaterThan(-1);
    expect(fetchAt).toBeGreaterThan(guard);
    expect(gate).toContain("useDocumentSessionMode()");
    expect(gate).toContain("hasLiveSubscription(j)");
    expect(gate).toContain("}, [mode]);");
    const cards = read("src/components/pricing/PricingCards.tsx");
    const cardFetch = cards.indexOf('fetch("/api/account/plan"');
    const cardEffect = cards.slice(cards.lastIndexOf("useEffect", cardFetch), cardFetch);
    expect(cardEffect).toContain("if (!signedInId)");
  });

  it("a signed-in visitor on public /pricing is a member document, not guest", async () => {
    // Public is the page gate. The session mode has no "public" value.
    expect(documentAccess("/pricing")).toBe("public");
    expect(read("src/components/DocumentSession.tsx")).toContain('export type DocumentSessionMode = "guest" | "member"');
    expect(read("src/app/layout.tsx")).toContain('headerList.get("x-af-doc") === "member" ? "member" : "guest"');
    const signedIn = new NextRequest("https://aetherforgeai.co.nz/pricing", {
      headers: { cookie: "__Secure-better-auth.session_token=signed-in-token" },
    });
    const member = await middleware(signedIn);
    expect(member.status).toBe(200);
    expect(member.headers.get("location")).toBeNull();
    expect(member.headers.get("x-middleware-request-x-af-doc")).toBe("member");
    const signedOut = await middleware(new NextRequest("https://aetherforgeai.co.nz/pricing"));
    expect(signedOut.status).toBe(200);
    expect(signedOut.headers.get("x-middleware-request-x-af-doc")).toBe("guest");
  });
});

const INTERNAL_PORTFOLIO_LINK = /(?:href|to)\s*[:=]\s*["'`]\/portfolio(?:["'`?#\s)]|$)|(?:push|replace)\(\s*["'`]\/portfolio["'`]|\]\(\/portfolio(?:[)#]|\))/;

describe("CRAWL-A F8: /portfolio links go to /dashboard, and the alias is one 308", () => {
  it("no internal link still points at /portfolio", () => {
    expect(CHANGELOG_ENTRIES.map((entry) => entry.href)).not.toContain("/portfolio");
    const hits = walk("src")
      .filter((file) => /\.(tsx|ts|jsx|js|md|mdx)$/.test(file) && !file.endsWith(".test.ts") && !file.endsWith(".test.tsx"))
      .filter((file) => INTERNAL_PORTFOLIO_LINK.test(read(file)));
    expect(hits).toEqual([]);
  });

  it("middleware 308s /portfolio to /dashboard before any earlier redirect or the 404 rewrite", async () => {
    expect(gsc404Redirect("/portfolio")).toBeNull();
    expect(permanentRedirect("/portfolio")).toBeNull();
    expect(publicAliasRedirect("/portfolio")).toBeNull();
    expect(portfolioAliasRedirect("/portfolio")).toBe("/dashboard");
    expect(portfolioAliasRedirect("/portfolio/")).toBe("/dashboard");
    expect(portfolioAliasStatus("/portfolio")).toBe(308);
    expect(portfolioAliasRedirect("/dashboard")).toBeNull();
    expect(portfolioAliasStatus("/alerts")).toBe(307);
    for (const pathName of ["/portfolio", "/portfolio/"]) {
      const res = await middleware(new NextRequest(`https://aetherforgeai.co.nz${pathName}`));
      expect(res.status).toBe(308);
      const loc = new URL(res.headers.get("location")!);
      expect(loc.pathname).toBe("/dashboard");
      expect(loc.search).toBe("");
    }
    const rows = await nextConfig.redirects!();
    const portfolio = rows.filter((row) => row.source === "/portfolio");
    expect(portfolio).toHaveLength(1);
    expect(portfolio[0]).toMatchObject({ destination: "/dashboard", permanent: true });
  });
});

const MEMBER_SHELL_VIEWS: DashboardView[] = [
  "home",
  "alerts",
  "bots",
  "cash",
  "metals",
  "asx",
  "nasdaq",
  "dow",
  "nzsx",
  "stocks",
  "crypto",
  "transactions",
];

describe("CRAWL-A F10: signed-in dashboard server HTML has one H1", () => {
  it.each(MEMBER_SHELL_VIEWS)("member %s first HTML has exactly one H1, the view title", (view) => {
    const html = renderToStaticMarkup(createElement(DashboardSessionShell, { view, guestDocument: false }));
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toContain(`<h1 class="sr-only">${dashboardPageTitle(view)}</h1>`);
  });

  it("a guest document keeps its own heading and does not add a second", () => {
    const html = renderToStaticMarkup(createElement(DashboardSessionShell, { view: "home", guestDocument: true }));
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).not.toContain(">Dashboard</h1>");
  });

  it("the book view replaces that heading instead of keeping both", () => {
    const shell = read("src/components/dashboard/DashboardSessionShell.tsx");
    const ready = shell.indexOf("<PortfolioDashboard");
    expect(ready).toBeGreaterThan(shell.indexOf('<h1 className="sr-only">{dashboardPageTitle(view)}</h1>'));
    expect(shell.slice(ready)).not.toContain("sr-only");
    const book = read("src/components/dashboard/PortfolioDashboard.tsx");
    expect(book.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(book).toContain("{pageTitle}");
  });
});
