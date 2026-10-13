import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("H11 nav", () => {
  it("adds How it works, Projections and Trust beside the existing More links", () => {
    const nav = readFileSync(path.join(process.cwd(), "src/components/TopNav.tsx"), "utf8");
    const more = nav.slice(nav.indexOf("const MORE_LINKS"), nav.indexOf("const NAV_LINKS"));
    expect(more).toContain('{ href: "/performance", label: "Example results"');
    expect(more).toContain('{ href: "/tax", label: "Tax"');
    expect(more).toContain('{ href: "/pricing", label: "Pricing"');
    expect(more).toContain('{ href: "/how-it-works", label: "How it works"');
    expect(more).toContain('{ href: "/projections", label: "Projections"');
    expect(more).toContain('{ href: "/trust", label: "Trust"');
    expect(nav).toContain('{ href: "/markets", label: "Markets"');
  });

  it("omits Market Assistant from the signed-in profile menu", () => {
    const nav = readFileSync(path.join(process.cwd(), "src/components/TopNav.tsx"), "utf8");
    const account = nav.slice(nav.indexOf("function AccountMenu"), nav.indexOf("function MobileDrawer"));
    const mobile = nav.slice(nav.indexOf("function MobileDrawer"), nav.indexOf("export function TopNav"));
    expect(account).toContain("function AccountMenu");
    expect(mobile).toContain("function MobileDrawer");
    expect(account).not.toMatch(/Market Assistant/i);
    expect(account).not.toContain('href="/chat"');
    expect(mobile).not.toMatch(/Market Assistant/i);
    expect(mobile).not.toContain('href="/chat"');
    expect(nav).not.toMatch(/Market Assistant/i);
    expect(nav).not.toContain('href="/chat"');
    expect(account).toContain("<HeadmasterMenuLink");
    expect(account).toContain("Account &amp; Settings");
    expect(mobile).toContain("Account &amp; Settings");
  });
});
