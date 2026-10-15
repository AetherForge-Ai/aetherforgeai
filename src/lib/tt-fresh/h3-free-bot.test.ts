import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { decideFreeBotChoice } from "@/lib/free-bot-choice";

const free = (bot_access: string | null) => ({ subscription_status: "active", subscription_plan: "free", bot_access });

describe("TT fresh H3 — Free plan gets one bot", () => {
  it("first choice is allowed", () => {
    expect(decideFreeBotChoice(free("none"), "stock")).toEqual({ ok: true, botAccess: "stock" });
    expect(decideFreeBotChoice({ bot_access: null }, "crypto")).toEqual({ ok: true, botAccess: "crypto" });
  });
  it("switching to the second bot is refused with 403 (CR-6)", () => {
    const d = decideFreeBotChoice(free("stock"), "crypto");
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.status).toBe(403);
  });
  it("re-choosing the same bot and legacy both stay allowed", () => {
    expect(decideFreeBotChoice(free("stock"), "stock").ok).toBe(true);
    expect(decideFreeBotChoice(free("both"), "crypto")).toEqual({ ok: true, botAccess: "both" });
  });
  it("route and UI use the rule", () => {
    expect(readFileSync("src/app/api/free-trial/activate/route.ts", "utf8")).toContain("decideFreeBotChoice");
    expect(readFileSync("src/components/dashboard/ReportCenter.tsx", "utf8")).toMatch(/freePlan && access !== "stock"/);
  });
});
