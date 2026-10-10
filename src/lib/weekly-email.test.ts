import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BASELINE_FX_TO_NZD, formatFxInput, formatNzd, formatSignedMoney } from "@/lib/currency";
import { AI_REQUEST_LINES, AI_SENT_CATEGORIES } from "@/lib/public-copy";
import { CRYPTO_PROJECTIONS_PAUSED } from "@/lib/projection-pause";
import type { Stock } from "@/lib/portfolio";
import {
  applyWeeklyEmailOptOut,
  createMemoryWeeklyEmailStore,
  decodeWeeklyEmailPreference,
  emailIsVerified,
  encodeWeeklyEmailPreference,
  estimateWeeklyEmailCost,
  handleWeeklyEmailCron,
  isoWeekFromAuckland,
  paidWeeklyEmailPlan,
  runWeeklyEmailJob,
  selectWeeklyEmailRecipient,
  signWeeklyEmailToken,
  verifyWeeklyEmailToken,
  weeklyEmailCostCeiling,
  weeklyEmailSendingEnabled,
  weeklyEmailWindow,
  type WeeklyEmailCandidate,
} from "@/lib/weekly-email";
import {
  composeWeeklyEmail,
  renderWeeklyEmail,
  scrubWeeklyAiNote,
  weeklyEmailUnsubscribeHref,
  type WeeklyEmailBook,
} from "@/lib/weekly-email-copy";

function read(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

/** Monday 12 Oct 2026, 07:00 in Pacific/Auckland (NZDT, UTC+13). */
const MONDAY_OPEN = new Date("2026-10-11T18:00:00.000Z");

function paid(overrides: Partial<WeeklyEmailCandidate> = {}): WeeklyEmailCandidate {
  return {
    id: "user-starter",
    email: "sample.member@example.test",
    emailVerified: 1,
    name: "Sample Member",
    subscriptionStatus: "active",
    subscriptionPlan: "starter_monthly",
    cashNzd: 50,
    ...overrides,
  };
}

// TEST-ONLY fixture. Not a member book and not a market print.
function sampleBook(): WeeklyEmailBook {
  const series = Array.from({ length: 45 }, (_, index) => 10 + index * 0.05);
  const stock = (ticker: string, shares: number, price: number, asset: Stock["asset_type"]): Stock => ({
    _id: ticker,
    ticker,
    asset_type: asset,
    company_name: asset === "crypto" ? "Sample Coin" : "Sample Holdings Ltd",
    sector: asset === "crypto" ? "Sample coins" : "Sample sector",
    shares,
    purchase_price: price,
    current_price: price,
  });
  return {
    loaded: true,
    cashNzd: 50,
    fx: BASELINE_FX_TO_NZD,
    fxSourced: false,
    series: { "SAMP.NZ": series, SAMPCOIN: series },
    stocks: [
      { ...stock("SAMP.NZ", 10, 12.5, "stock"), purchase_price: 10 },
      stock("SAMP2.NZ", 1, 10, "stock"),
      stock("SAMPCOIN", 2, 1, "crypto"),
    ],
  };
}

describe("weekly email", () => {
  it("opens on Monday morning in Auckland and uses the ISO week", () => {
    expect(isoWeekFromAuckland(2026, 10, 12)).toBe("2026-W42");
    expect(weeklyEmailWindow(MONDAY_OPEN)).toEqual({ open: true, isoWeek: "2026-W42" });
    expect(weeklyEmailWindow(new Date("2026-10-11T19:59:00.000Z")).open).toBe(true);
    expect(weeklyEmailWindow(new Date("2026-10-11T20:00:00.000Z")).open).toBe(false);
    expect(weeklyEmailWindow(new Date("2026-10-12T18:00:00.000Z")).open).toBe(false);
    expect(formatNzd(125)).toBe("NZ$125.00");
    expect(formatFxInput(1.67)).toBe("1.6700");
  });

  it("selects verified paid plans and skips free, unverified, and expired accounts", () => {
    expect(paidWeeklyEmailPlan("starter_yearly")).toBe(true);
    expect(paidWeeklyEmailPlan("pro_monthly")).toBe(true);
    expect(paidWeeklyEmailPlan("ultimate_yearly")).toBe(true);
    expect(paidWeeklyEmailPlan("free")).toBe(false);
    expect(paidWeeklyEmailPlan("none")).toBe(false);
    expect(emailIsVerified(1)).toBe(true);
    expect(emailIsVerified(0)).toBe(false);
    expect(emailIsVerified(false)).toBe(false);
    expect(selectWeeklyEmailRecipient(paid(), MONDAY_OPEN).ok).toBe(true);
    expect(selectWeeklyEmailRecipient(paid({ subscriptionPlan: "pro_monthly" }), MONDAY_OPEN).ok).toBe(true);
    expect(selectWeeklyEmailRecipient(paid({ subscriptionPlan: "free" }), MONDAY_OPEN)).toEqual({
      ok: false,
      reason: "not-paid",
    });
    expect(selectWeeklyEmailRecipient(paid({ subscriptionStatus: "canceled" }), MONDAY_OPEN)).toEqual({
      ok: false,
      reason: "not-paid",
    });
    expect(selectWeeklyEmailRecipient(paid({ emailVerified: 0 }), MONDAY_OPEN)).toEqual({
      ok: false,
      reason: "unverified",
    });
    expect(
      selectWeeklyEmailRecipient(paid({ subscriptionExpiresAt: "2026-10-01T00:00:00.000Z" }), MONDAY_OPEN),
    ).toEqual({ ok: false, reason: "expired" });
  });

  it("is idempotent for one user in one ISO week and does not email a free account", async () => {
    const store = createMemoryWeeklyEmailStore();
    const sent: { to: string }[] = [];
    const users = [
      paid(),
      paid({ id: "user-free", email: "free.member@example.test", subscriptionPlan: "free" }),
      paid({ id: "user-empty", email: "empty.member@example.test" }),
    ];
    const args = {
      now: MONDAY_OPEN,
      env: { WEEKLY_EMAIL_SEND: "on", CRON_SECRET: "test-secret" },
      users,
      store,
      loadBook: async (user: WeeklyEmailCandidate) =>
        user.id === "user-empty"
          ? { loaded: true, stocks: [], cashNzd: 80, fx: BASELINE_FX_TO_NZD, series: {} }
          : sampleBook(),
      render: renderWeeklyEmail,
      complete: async (prompt: string) => {
        expect(prompt).not.toContain("sample.member@example.test");
        expect(prompt).toContain("Holding count");
        return "One sample name is most of this paper book.";
      },
      send: async (mail: { to: string[] }) => {
        sent.push({ to: mail.to[0] });
      },
      unsubscribeUrl: async (userId: string) =>
        weeklyEmailUnsubscribeHref(await signWeeklyEmailToken(userId, "test-secret", MONDAY_OPEN.getTime())),
    };
    const first = await runWeeklyEmailJob(args);
    expect(first.sent).toBe(1);
    expect(first.skipped["not-paid"]).toBe(1);
    expect(first.skipped["empty-book"]).toBe(1);
    expect(sent).toEqual([{ to: "sample.member@example.test" }]);
    expect(store.raw["user-starter"]).toBe("v1|on|2026-W42");

    const second = await runWeeklyEmailJob(args);
    expect(second.sent).toBe(0);
    expect(second.skipped["already-sent"]).toBe(1);
    expect(sent).toHaveLength(1);
  });

  it("stays off unless the flag is exactly on, and stays quiet outside Monday morning", async () => {
    expect(weeklyEmailSendingEnabled({})).toBe(false);
    expect(weeklyEmailSendingEnabled({ WEEKLY_EMAIL_SEND: "yes" })).toBe(false);
    expect(weeklyEmailSendingEnabled({ WEEKLY_EMAIL_SEND: "on" })).toBe(true);
    const send = async () => {
      throw new Error("send was called");
    };
    const base = {
      now: MONDAY_OPEN,
      users: [paid()],
      store: createMemoryWeeklyEmailStore(),
      loadBook: async () => sampleBook(),
      render: renderWeeklyEmail,
      complete: async () => "note",
      send,
      unsubscribeUrl: async () => "https://aetherforgeai.co.nz/api/weekly-email/unsubscribe?token=test",
    };
    const off = await runWeeklyEmailJob({ ...base, env: { CRON_SECRET: "test-secret" } });
    expect(off.sender).toBe("off");
    expect(off.reason).toBe("sender-off");
    expect(off.sent).toBe(0);
    const closed = await runWeeklyEmailJob({
      ...base,
      now: new Date("2026-10-12T18:00:00.000Z"),
      env: { WEEKLY_EMAIL_SEND: "on", CRON_SECRET: "test-secret" },
    });
    expect(closed.reason).toBe("outside-window");
    expect(closed.sent).toBe(0);
  });

  it("turns the preference off from a signed token and rejects a bad or expired token", async () => {
    const secret = "test-secret";
    const token = await signWeeklyEmailToken("user-starter", secret, MONDAY_OPEN.getTime());
    expect(await verifyWeeklyEmailToken(token, secret, MONDAY_OPEN.getTime())).toBe("user-starter");
    expect(await verifyWeeklyEmailToken(`${token}x`, secret, MONDAY_OPEN.getTime())).toBeNull();
    const stale = await signWeeklyEmailToken("user-starter", secret, Date.parse("2020-01-01T00:00:00.000Z"));
    expect(await verifyWeeklyEmailToken(stale, secret, MONDAY_OPEN.getTime())).toBeNull();

    const store = createMemoryWeeklyEmailStore();
    await applyWeeklyEmailOptOut(store, "user-starter");
    expect(decodeWeeklyEmailPreference(store.raw["user-starter"])).toEqual({
      optedOut: true,
      lastIsoWeek: null,
    });
    expect(encodeWeeklyEmailPreference({ optedOut: false, lastIsoWeek: "2026-W42" })).toBe("v1|on|2026-W42");
    const sent: string[] = [];
    const result = await runWeeklyEmailJob({
      now: MONDAY_OPEN,
      env: { WEEKLY_EMAIL_SEND: "on", CRON_SECRET: secret },
      users: [paid()],
      store,
      loadBook: async () => sampleBook(),
      render: renderWeeklyEmail,
      send: async () => {
        sent.push("sent");
      },
      unsubscribeUrl: async () => weeklyEmailUnsubscribeHref(token),
    });
    expect(result.sent).toBe(0);
    expect(result.skipped["opted-out"]).toBe(1);
    expect(sent).toHaveLength(0);
  });

  it("renders a test-only book in HTML and text without rating labels", async () => {
    const draft = composeWeeklyEmail(sampleBook());
    expect(draft).not.toBeNull();
    const facts = {
      ...draft!.facts,
      greetingName: "Sample Member",
      asOfLabel: "12 Oct 2026",
    };
    const mail = renderWeeklyEmail({
      to: "sample.member@example.test",
      facts,
      aiNote: "One sample name is most of this paper book.",
      unsubscribeUrl: "https://aetherforgeai.co.nz/api/weekly-email/unsubscribe?token=sample",
    });
    const body = `${mail.html}\n${mail.text}`;
    expect(mail.subject).toBe("AetherForge AI weekly paper book — 12 Oct 2026");
    expect(mail.from).toBe("admin@aetherforgeai.co.nz");
    expect(mail.replyTo).toBe("admin@aetherforgeai.co.nz");
    expect(mail.text && mail.text.length > 0).toBe(true);
    expect(body).toContain("NZ$125.00");
    expect(body).toContain(formatNzd(facts.cashNzd));
    expect(body).toContain(formatSignedMoney(facts.gainNzd));
    expect(body).toContain("1.6700");
    expect(body).toContain("1.0900");
    expect(body).toContain("12 Oct 2026");
    expect(body).toContain("Sample Holdings Ltd");
    expect(body).toContain("Ideas to consider");
    expect(body).toContain("An idea to consider");
    expect(body).toContain("No verified ex-dividend date");
    expect(body).toContain("No verified earnings date");
    expect(body).toContain("Crypto projections are paused");
    expect(body).toContain("SAMP.NZ: illustrative 7-day move");
    expect(body).toContain("SAMP2.NZ: no verified 7-day stock projection");
    expect(body).toContain("AI-written note: One sample name is most of this paper book.");
    expect(body).toContain("not financial advice");
    expect(body).toContain("Turn off this weekly email");
    expect(body).not.toContain("sample.member@example.test");
    expect(body).not.toMatch(/\b(Strong Buy|Strong Sell|Buy|Sell|Accumulate)\b/);
    expect(body).not.toMatch(/\bGST\b/);
    expect(body).not.toMatch(/\b(Grok|xAI|OpenAI|Claude|Gemini|ZENITH|ULTRA)\b/);
    expect(body).toContain("Not an official, licensed, or real-time quote.");
    expect(CRYPTO_PROJECTIONS_PAUSED).toBe(true);
    expect(scrubWeeklyAiNote("Strong Buy Sample Holdings Ltd")).toBeNull();
  });

  it("reports the completion ceiling from the published short-context rates", () => {
    const ceiling = weeklyEmailCostCeiling(1.67);
    expect(ceiling.usd).toBeCloseTo(0.0057, 6);
    expect(ceiling.nzd).toBeCloseTo(0.009519, 6);
    const typical = estimateWeeklyEmailCost(2000, 250, 1.67);
    expect(typical.inputTokens).toBe(500);
    expect(typical.outputTokens).toBe(250);
    expect(typical.usd).toBeCloseTo(0.0025, 6);
    expect(typical.nzd).toBeLessThan(0.01);
  });

  it("continues after one account throws and stops at the send cap", async () => {
    const store = createMemoryWeeklyEmailStore();
    const sent: string[] = [];
    const users = [
      paid({ id: "user-bad", email: "bad.member@example.test" }),
      ...Array.from({ length: 21 }, (_, index) =>
        paid({ id: `user-${index}`, email: `sample${index}@example.test` }),
      ),
    ];
    const result = await runWeeklyEmailJob({
      now: MONDAY_OPEN,
      env: { WEEKLY_EMAIL_SEND: "on", CRON_SECRET: "test-secret" },
      users,
      store,
      loadBook: async (user) => {
        if (user.id === "user-bad") throw new Error("book read failed");
        return sampleBook();
      },
      render: renderWeeklyEmail,
      complete: async () => null,
      send: async (mail) => {
        sent.push(mail.to[0] || "");
      },
      unsubscribeUrl: async () => "https://aetherforgeai.co.nz/api/weekly-email/unsubscribe?token=sample",
    });
    expect(result.failed).toBe(1);
    expect(result.sent).toBe(20);
    expect(result.deferred).toBe(1);
    expect(sent).toHaveLength(20);
    expect(JSON.stringify(result)).not.toContain("@example.test");
  });

  it("requires the cron secret and does not call send when the secret is wrong", async () => {
    let called = false;
    const denied = await handleWeeklyEmailCron({
      url: "https://aetherforgeai.co.nz/api/cron/weekly-email",
      headers: { get: () => null },
      env: { CRON_SECRET: "test-secret", WEEKLY_EMAIL_SEND: "on" },
      now: MONDAY_OPEN,
      users: [paid()],
      store: createMemoryWeeklyEmailStore(),
      loadBook: async () => sampleBook(),
      render: renderWeeklyEmail,
      send: async () => {
        called = true;
      },
      unsubscribeUrl: async () => "https://aetherforgeai.co.nz/api/weekly-email/unsubscribe?token=sample",
    });
    expect(denied.status).toBe(401);
    expect(called).toBe(false);
    const closed = await handleWeeklyEmailCron({
      url: "https://aetherforgeai.co.nz/api/cron/weekly-email",
      headers: { get: () => null },
      env: { WEEKLY_EMAIL_SEND: "on" },
      now: MONDAY_OPEN,
      users: [paid()],
      store: createMemoryWeeklyEmailStore(),
      loadBook: async () => sampleBook(),
      render: renderWeeklyEmail,
      send: async () => {
        called = true;
      },
      unsubscribeUrl: async () => "https://aetherforgeai.co.nz/api/weekly-email/unsubscribe?token=sample",
    });
    expect(closed.status).toBe(503);
    expect(called).toBe(false);
  });

  it("states the weekly email in the public AI lines and keeps the sender hard-off", () => {
    const lines = AI_REQUEST_LINES.join("\n");
    for (const category of AI_SENT_CATEGORIES["/api/cron/weekly-email"]) {
      expect(lines).toContain(category);
    }
    expect(lines).not.toMatch(/\b(Grok|xAI|OpenAI|Claude|Gemini)\b/);
    expect(lines).not.toMatch(/\bGST\b/);
    const privacy = read("src/app/privacy-policy/page.tsx");
    expect(privacy).toContain("weekly paper-book email");
    expect(privacy).toContain("unsubscribe link");
    const preview = read("src/app/api/admin/weekly-email/preview/route.ts");
    expect(preview).toContain("Preview only. This was not sent.");
    expect(preview).toContain("PRIVACY_OFFICER_EMAIL");
    expect(preview).not.toContain("deliverWeeklyEmail");
    expect(preview).not.toContain("sendTransactionalEmail");
    const cron = read("src/app/api/cron/weekly-email/route.ts");
    expect(cron).toContain("WEEKLY_EMAIL_SEND");
    expect(cron).toContain("pull-check:weekly-email-2026-10-11");
    expect(cron).not.toContain("generateReportForUser");
    const live = read("src/lib/weekly-email-live.ts");
    expect(live).toContain('throw new Error("Weekly email sender is off.")');
    expect(live).toContain("sendTransactionalEmail");
    expect(live).not.toContain("generateReportForUser");
    const watchlist = read("src/app/api/watchlist/route.ts");
    expect(watchlist).toContain("WEEKLY_EMAIL_LEDGER_TICKER");
    expect(read("src/lib/weekly-email.ts")).toContain("pull-check:weekly-email-2026-10-11");
    expect(read("qa/PULL-CHECK-2026-10-10.md")).toContain("pull-check:weekly-email-2026-10-11");
  });
});
