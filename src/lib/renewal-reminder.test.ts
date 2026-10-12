import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  aucklandDayPlus,
  handleRenewalReminderRequest,
  renewalReminderEnabled,
  renewalReminderMail,
  selectRenewalReminders,
  type RenewalReminderCandidate,
} from "@/lib/renewal-reminder";

function read(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

const NOW = new Date("2026-10-06T01:00:00.000Z");

function annual(overrides: Partial<RenewalReminderCandidate> = {}): RenewalReminderCandidate {
  const due = aucklandDayPlus(NOW, 7);
  return {
    id: "user-1",
    email: "member@example.com",
    emailVerified: true,
    subscriptionStatus: "active",
    subscriptionPlan: "starter_yearly",
    subscriptionExpiresAt: new Date(`${due}T01:00:00.000Z`).toISOString(),
    ...overrides,
  };
}

describe("annual renewal reminder", () => {
  it("stays off unless the flag is exactly on", () => {
    expect(renewalReminderEnabled({})).toBe(false);
    expect(renewalReminderEnabled({ RENEWAL_REMINDER_ENABLED: "true" })).toBe(false);
    expect(renewalReminderEnabled({ RENEWAL_REMINDER_ENABLED: "on" })).toBe(true);
  });

  it("selects an active annual plan seven Auckland days before expiry", () => {
    const due = annual();
    const later = annual({
      id: "later",
      subscriptionExpiresAt: new Date(Date.parse(due.subscriptionExpiresAt || "") + 2 * 86400000).toISOString(),
    });
    const monthly = annual({ id: "month", subscriptionPlan: "starter_monthly" });
    const cancelled = annual({ id: "cancelled", subscriptionStatus: "canceled" });
    const unverified = annual({ id: "unverified", emailVerified: false });
    const selected = selectRenewalReminders([due, later, monthly, cancelled, unverified], NOW);
    expect(selected.map((row) => row.id)).toEqual(["user-1"]);
  });

  it("writes the reminder without a name, an email address, or GST", () => {
    const due = annual();
    const mail = renewalReminderMail({
      to: due.email,
      plan: due.subscriptionPlan,
      expiresAt: due.subscriptionExpiresAt || "",
    });
    expect(mail.to).toBe("member@example.com");
    expect(mail.subject).toBe("Your annual plan renews in 7 days");
    expect(mail.text).toContain("Hello,");
    expect(mail.text).toContain("Starter");
    expect(mail.text).toContain("within 14 days of your annual charge or renewal");
    expect(mail.text).toContain("/refunds");
    expect(mail.html).not.toContain("member@example.com");
    expect(mail.text).not.toContain("Zelda");
    expect(`${mail.subject}\n${mail.text}`).not.toMatch(/\bGST\b/);
  });

  it("requires the cron secret and does not send while the flag is off", async () => {
    const send = vi.fn(async () => undefined);
    const loadCandidates = vi.fn(async () => [annual()]);
    const closed = await handleRenewalReminderRequest({
      url: "https://www.aetherforgeai.co.nz/api/cron/renewal-reminder",
      headers: { get: () => null },
      env: {},
      now: NOW,
      loadCandidates,
      send,
    });
    expect(closed.status).toBe(503);
    expect(send).not.toHaveBeenCalled();
    expect(loadCandidates).not.toHaveBeenCalled();

    const denied = await handleRenewalReminderRequest({
      url: "https://www.aetherforgeai.co.nz/api/cron/renewal-reminder?key=wrong",
      headers: { get: () => null },
      env: { CRON_SECRET: "secret", RENEWAL_REMINDER_ENABLED: "on" },
      now: NOW,
      loadCandidates,
      send,
    });
    expect(denied.status).toBe(401);
    expect(send).not.toHaveBeenCalled();

    const disabled = await handleRenewalReminderRequest({
      url: "https://www.aetherforgeai.co.nz/api/cron/renewal-reminder?key=secret",
      headers: { get: () => null },
      env: { CRON_SECRET: "secret" },
      now: NOW,
      loadCandidates,
      send,
    });
    expect(disabled.body.reason).toBe("disabled");
    expect(disabled.body.sent).toBe(0);
    expect(send).not.toHaveBeenCalled();
    expect(loadCandidates).not.toHaveBeenCalled();

    const sent = await handleRenewalReminderRequest({
      url: "https://www.aetherforgeai.co.nz/api/cron/renewal-reminder",
      headers: { get: (name) => (name === "x-cron-secret" ? "secret" : null) },
      env: { CRON_SECRET: "secret", RENEWAL_REMINDER_ENABLED: "on" },
      now: NOW,
      loadCandidates,
      send,
    });
    expect(sent.body).toMatchObject({ ok: true, sent: 1, reason: "sent" });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("guards the route with CRON_SECRET and does not add a database column", () => {
    const route = read("src/app/api/cron/renewal-reminder/route.ts");
    const live = read("src/lib/renewal-reminder-live.ts");
    expect(route).toContain("CRON_SECRET");
    expect(route).toContain("RENEWAL_REMINDER_ENABLED");
    expect(live).toContain("sendTransactionalEmail");
    expect(live).not.toContain("editRecord");
    expect(live).not.toContain("createRecord");
  });
});
