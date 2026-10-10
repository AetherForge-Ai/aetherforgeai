import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  ACTIVITY_EMAIL_FROM,
  ACTIVITY_EMAIL_FROM_NAME,
  ACTIVITY_EMAIL_REPLY_TO,
  BRANDED_SENDER_DNS,
  activityEmailSendingEnabled,
  previewActivityEmail,
  renderActivityEmail,
} from "@/lib/activity-email";
import { reportEmailModalNote, reportSavedToast } from "@/lib/report-email-copy";
import { DEFAULT_EMAIL_PREFS } from "@/lib/notification-prefs";

function read(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("H6 activity email stays a preview", () => {
  it("cannot be turned on from the environment", () => {
    const src = read("src/lib/activity-email.ts");
    const start = src.indexOf("export function activityEmailSendingEnabled");
    const end = src.indexOf("function escapeHtml");
    const fn = src.slice(start, end);
    expect(fn).toContain("return false");
    expect(fn).not.toContain("process.env");
    expect(activityEmailSendingEnabled()).toBe(false);
    expect(src).not.toContain("sendTransactionalEmail");
    expect(src).not.toMatch(/totalum/i);
  });

  it("renders welcome, report and trade notes and never marks them sent", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const welcome = previewActivityEmail({
      kind: "welcome",
      to: "member@example.com",
      name: "Aroha",
      prefs: { ...DEFAULT_EMAIL_PREFS, productNews: true },
      when: "2026-10-10",
    });
    expect(welcome.sent).toBe(false);
    expect(welcome.mode).toBe("preview");
    expect(welcome.reason).toBe("sending-off");
    expect(welcome.from).toBe(ACTIVITY_EMAIL_FROM);
    expect(welcome.from).toBe("noreply@aetherforgeai.co.nz");
    expect(welcome.fromName).toBe(ACTIVITY_EMAIL_FROM_NAME);
    expect(welcome.fromName).toBe("AetherForge AI");
    expect(welcome.replyTo).toBe(ACTIVITY_EMAIL_REPLY_TO);
    expect(welcome.subject).toBe("Welcome to AetherForge AI");
    expect(welcome.text).toContain("10 Oct 2026");
    expect(welcome.text).toContain("was not sent");
    expect(welcome.html).not.toMatch(/totalum/i);

    const quiet = previewActivityEmail({
      kind: "report-ready",
      to: "member@example.com",
      reportTitle: "Stox note",
      prefs: DEFAULT_EMAIL_PREFS,
    });
    expect(quiet.sent).toBe(false);
    expect(quiet.reason).toBe("preference-off");

    const trade = renderActivityEmail({
      kind: "trade-ledger",
      to: "member@example.com",
      tradeLabel: "Buy AIR.NZ",
      amountNzd: 1000,
      when: "2026-10-10",
    });
    expect(trade.subject).toContain("Buy AIR.NZ");
    expect(trade.text).toContain("NZ$1,000.00");
    expect(trade.text).toContain("NZ$0.00");
    expect(log.mock.calls.join(" ")).toContain("m***@example.com");
    expect(log.mock.calls.join(" ")).not.toContain("member@example.com");
    log.mockRestore();
  });

  it("lists the branded-sender DNS records as placeholders", () => {
    expect(BRANDED_SENDER_DNS.map((row) => row.purpose)).toEqual(["SPF", "DKIM", "DMARC"]);
    expect(BRANDED_SENDER_DNS[0].value).toContain("v=spf1 include:<mailbox-host> -all");
    expect(BRANDED_SENDER_DNS[1].value).toContain("p=<public key from the mailbox host>");
    expect(BRANDED_SENDER_DNS[1].note).toContain("private key");
    expect(BRANDED_SENDER_DNS[2].value).toContain("rua=mailto:admin@aetherforgeai.co.nz");
    expect(BRANDED_SENDER_DNS[2].value).toContain("p=none");
  });

  it("makes the toast and the modal say the same thing when nothing was emailed", () => {
    expect(reportSavedToast(false)).toBe("Report saved below. No report email was sent.");
    expect(reportEmailModalNote(false)).toBe(" No report email was sent.");
    expect(reportSavedToast(false)).toContain("No report email was sent.");
    expect(reportEmailModalNote(false)).toContain("No report email was sent.");
    expect(reportSavedToast(false)).not.toContain("pending");
    const center = read("src/components/dashboard/ReportCenter.tsx");
    expect(center).toContain("reportSavedToast");
    expect(center).toContain("reportEmailModalNote");
    expect(center).not.toContain("email delivery is pending");
  });

  it("keeps report, trial and trade paths on the preview and off the sender", () => {
    for (const rel of [
      "src/lib/report-service.ts",
      "src/lib/trial-report.ts",
      "src/app/api/transactions/route.ts",
      "src/app/api/account/activity-email/route.ts",
      "src/app/register/page.tsx",
    ]) {
      const src = read(rel);
      expect(src, rel).not.toContain("sendTransactionalEmail");
    }
    const route = read("src/app/api/account/activity-email/route.ts");
    expect(route).toContain('to: "member@example.com"');
    expect(route).toContain("sent: false");
    expect(route).not.toContain("body.to");
    expect(read("src/app/register/page.tsx")).toContain('"/api/account/activity-email"');
    expect(read("src/lib/auth.ts")).not.toContain("activity-email");
    expect(read("src/lib/auth-mail.ts")).not.toContain("previewActivityEmail");
    expect(read("src/lib/transactional-mail.ts")).not.toContain("previewActivityEmail");
  });
});
