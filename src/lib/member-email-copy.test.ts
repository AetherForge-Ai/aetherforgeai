import { describe, expect, it } from "vitest";
import {
  WELCOME_SUBJECT,
  emailSendAccepted,
  reportEmailHtml,
  welcomeEmailHtml,
} from "@/lib/member-email-copy";

describe("welcome email", () => {
  it("uses the exact subject and explains holdings plus the report bots", () => {
    expect(WELCOME_SUBJECT).toBe(
      "Welcome To AetherForgeAI - Intelligent Market and Portfolio Information and Data"
    );
    const html = welcomeEmailHtml({ name: "Aroha", appUrl: "https://aetherforgeai.co.nz/" });
    expect(html).toContain("Transaction");
    expect(html).toContain("holdings");
    expect(html).toContain("Stox");
    expect(html).toContain("Koins");
    expect(html).toContain("dashboard");
    expect(html).toContain("https://aetherforgeai.co.nz/dashboard/transactions");
    expect(html).toContain("https://aetherforgeai.co.nz/dashboard#report-center");
    expect(html).toContain("<style>");
    expect(html).not.toMatch(/\sstyle="/);
    expect(html).toContain("Hi Aroha,");
  });
});

describe("report email", () => {
  it("sends a short briefing that still reads without the style block", () => {
    const html = reportEmailHtml({
      title: "Stox report",
      summary: "Cash on book is NZ$63,678. Keep NZ$9,975 and reallocate NZ$53,703.",
      botLabel: "Stox",
      generatedAt: "4 Oct 2026, 9:00 am",
      appUrl: "https://aetherforgeai.co.nz",
    });
    expect(html).toContain("Stox report");
    expect(html).toContain("Keep NZ$9,975 and reallocate NZ$53,703.");
    expect(html).toContain("Report Centre");
    expect(html).not.toMatch(/\sstyle="/);
  });
});

describe("emailSendAccepted", () => {
  it("treats an empty result as accepted and an error payload as rejected", () => {
    expect(emailSendAccepted(null)).toBe(true);
    expect(emailSendAccepted(undefined)).toBe(true);
    expect(emailSendAccepted({})).toBe(true);
    expect(emailSendAccepted({ ok: false })).toBe(false);
    expect(emailSendAccepted({ error: "x" })).toBe(false);
    expect(emailSendAccepted({ data: { error: "x" } })).toBe(false);
    expect(emailSendAccepted({ ok: true })).toBe(true);
    expect(emailSendAccepted({ data: { success: true, message: "sent" } })).toBe(true);
    expect(emailSendAccepted({ errors: { errorMessage: "blocked" } })).toBe(false);
    expect(emailSendAccepted({ data: { success: false } })).toBe(false);
  });
});
