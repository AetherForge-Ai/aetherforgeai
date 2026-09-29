import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseDashboardSessionUser } from "./dashboard-session";

function read(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("signed-out dashboard gate", () => {
  it("does not embed an account book in the server page", () => {
    const page = read("src/lib/dashboard-page.tsx");
    expect(page).not.toContain("getCurrentUser");
    expect(page).toContain("DashboardSessionShell");
    expect(page).toContain("initialSignedOut");
    const shell = read("src/components/dashboard/DashboardSessionShell.tsx");
    expect(shell).toContain("GuestDashboardGate");
    expect(shell).toContain("confirmDashboardSession");
    expect(shell).not.toContain("Test UserAF");
    expect(read("src/middleware.ts")).toContain("anonymousAccountApi");
  });

  it("paints a session only when id and email are present, and drops cash from the gate payload", () => {
    expect(parseDashboardSessionUser(null)).toBeNull();
    expect(parseDashboardSessionUser({ user: null })).toBeNull();
    expect(parseDashboardSessionUser({ user: { id: "u1" } })).toBeNull();
    const parsed = parseDashboardSessionUser({
      user: {
        id: "u1",
        email: "member@example.com",
        name: "Member",
        greetingName: "Member",
        metalsEntitled: true,
        cash_balance: 11047.68,
        subscription: { botAccess: "both", status: "active", plan: "pro_monthly", tickerLimit: 75 },
      },
    });
    expect(parsed?.id).toBe("u1");
    expect(parsed?.metalsEntitled).toBe(true);
    expect(parsed?.subscription.botAccess).toBe("both");
    expect(parsed && "cash_balance" in parsed).toBe(false);
    expect(JSON.stringify(parsed)).not.toContain("11047");
  });
});