import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { readFileSync } from "node:fs";
import { AI_OFF_REPLY, aiPrivacyModeEnabled, applyAiPrivacy, parseAiPrivacyMode, redactHoldingsText } from "@/lib/ai-privacy";
import { hiddenSnapshotTicker } from "@/lib/crypto-snapshot";

const ctx = `PORTFOLIO SUMMARY (2 holdings):
- Total market value: $12,345.67
- Total unrealized P/L: $2,345.67 (+23.46%)
- FPH (Fisher & Paykel) | Health | 40 shares @ avg $25.00, now $33.10 | value $1,324.00 | P/L +32.40% | weight 10.7%
Cash: NZ$5,000 · total value 9876.5`;

describe("G-26 AI privacy mode", () => {
  it("redacts amounts and share counts, keeps tickers and percentages", () => {
    const r = redactHoldingsText(ctx);
    for (const s of ["12,345.67", "2,345.67", "25.00", "33.10", "1,324.00", "5,000", "9876.5", "40 shares"]) expect(r).not.toContain(s);
    for (const s of ["FPH", "Fisher & Paykel", "+23.46%", "+32.40%", "10.7%", "[qty hidden] shares", "[amount hidden]"]) expect(r).toContain(s);
  });
  it("off sends nothing; on is unchanged; redacted keeps only the member's question as typed", () => {
    const msgs = [
      { role: "system" as const, content: ctx },
      { role: "assistant" as const, content: "Your book is $12,345.67." },
      { role: "user" as const, content: "Is $500 a lot?" },
    ];
    expect(applyAiPrivacy(msgs, "off")).toBeNull();
    expect(applyAiPrivacy(msgs, "on")).toBe(msgs);
    const red = applyAiPrivacy(msgs, "redacted")!;
    expect(red[0].content).not.toContain("12,345.67");
    expect(red[1].content).not.toContain("12,345.67");
    expect(red[2].content).toBe("Is $500 a lot?");
    // A context block sent as the user turn (analysis report) is redacted too.
    expect(applyAiPrivacy([{ role: "user" as const, content: `PORTFOLIO DATA:\n${ctx}` }], "redacted")![0].content).not.toContain("12,345.67");
  });
  it("flag off unless AI_PRIVACY_MODE=1; unknown modes are 'on'; setting row is hidden", () => {
    expect(aiPrivacyModeEnabled({})).toBe(false);
    expect(aiPrivacyModeEnabled({ AI_PRIVACY_MODE: "1" })).toBe(true);
    expect(parseAiPrivacyMode("x")).toBe("on");
    expect(parseAiPrivacyMode("off")).toBe("off");
    expect(hiddenSnapshotTicker("AF-AIPV")).toBe(true);
    expect(AI_OFF_REPLY).not.toMatch(/grok|xai|ZENITH|ULTRA/i);
  });
  it("every signed-in AI route checks the mode before the provider call", () => {
    for (const f of [
      "src/app/api/chat/route.ts",
      "src/app/api/portfolio-coach/route.ts",
      "src/app/api/totalum/chat/route.ts",
      "src/app/api/analysis/route.ts",
      "src/app/api/ticker-analysis/route.ts",
    ]) {
      const src = readFileSync(f, "utf8");
      const gate = src.indexOf("applyAiPrivacy(messages, ");
      expect(gate, f).toBeGreaterThan(0);
      expect(src.indexOf("messages: sendMessages"), f).toBeGreaterThan(gate);
      expect(src, f).not.toMatch(/Completion\(\{\s*messages,/);
    }
    const trial = readFileSync("src/lib/trial-report.ts", "utf8");
    expect(trial).toMatch(/aiMode === "off" \|\| !isZenithConfigured\(\)/);
    expect(trial).toContain("enhanceWithGrok(report, await readAiPrivacyMode(user._id))");
  });
});
