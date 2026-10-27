// b83 CR-6c (develop only; build-version unchanged until a release)
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
vi.mock("server-only", () => ({}));
import { withTimeout, userIdFromEventObject, WEBHOOK_IO_TIMEOUT_MS } from "@/lib/stripe-webhook-util";

const route = () => readFileSync("src/app/api/stripe/webhook/route.ts", "utf8");

describe("b83 CR-6c: test events resolve the user without the DB", () => {
  it("invoice.paid carries userId on parent.subscription_details.metadata", () => {
    const inv = { metadata: {}, customer: "cus_x", parent: { type: "subscription_details", subscription_details: { metadata: { userId: "u_starter" } } } };
    expect(userIdFromEventObject(inv)).toBe("u_starter");
  });
  it("legacy invoice subscription_details and plain metadata both work", () => {
    expect(userIdFromEventObject({ subscription_details: { metadata: { userId: "a" } } })).toBe("a");
    expect(userIdFromEventObject({ metadata: { userId: "b" } })).toBe("b");
    expect(userIdFromEventObject({ metadata: {} })).toBeNull();
  });
  it("gate uses the helper before the customer lookup", () => {
    expect(route()).toMatch(/const testUserId = userIdFromEventObject\(obj\) \|\| \(await findUserIdByCustomer\(customerId\)\)/);
  });
});

describe("b83 CR-6c: bounded IO", () => {
  it("timeout is about 8s", () => expect(WEBHOOK_IO_TIMEOUT_MS).toBe(8000));
  it("rejects a hung call and passes a fast one", async () => {
    await expect(withTimeout(new Promise(() => {}), 20, "t")).rejects.toThrow(/timed out/);
    await expect(withTimeout(Promise.resolve(7), 20)).resolves.toBe(7);
  });
  it("customer lookup, user update and subscription read are all bounded", () => {
    const s = route();
    expect(s).toMatch(/withTimeout\(totalumSdk\.crud\.query\("user"/);
    expect(s).toMatch(/withTimeout\(totalumSdk\.crud\.editRecordById\("user", userId, patch\)/);
    expect(s).toMatch(/withTimeout\(readerFor\(subscription\.livemode\)\.subscriptions\.retrieve/);
  });
  it("invoice handlers stay log-only (2xx, no DB write)", () => {
    const s = route();
    const i = s.indexOf("async function handleInvoicePaid");
    expect(s.slice(i, s.indexOf("export async function POST"))).not.toMatch(/totalumSdk|updateUserSubscription/);
  });
});

describe("b83 CR-6c: GET /api/account/plan", () => {
  const getCurrentUser = vi.fn();
  vi.doMock("@/lib/session", () => ({ getCurrentUser: () => getCurrentUser() }));
  vi.doMock("@/lib/stripe-mode", () => ({
    checkoutStripe: () => ({ mode: "test", client: { subscriptions: { list: async () => ({ data: [{ id: "sub_1UUwmX9sOmzarzYkpNTwCVJL" }] }) } } }),
  }));
  it("401 when signed out", async () => {
    getCurrentUser.mockResolvedValue(null);
    const { GET } = await import("@/app/api/account/plan/route");
    expect((await GET()).status).toBe(401);
  });
  it("own plan, status and last 4 of the subscription id only", async () => {
    getCurrentUser.mockResolvedValue({ _id: "u1", subscription_plan: "monthly", subscription_status: "active", stripe_customer_id: "cus_x" });
    const { GET } = await import("@/app/api/account/plan/route");
    const body = await (await GET()).json();
    expect(body).toEqual({ plan: "monthly", status: "active", trialEndsAt: null, trialLine: null, subscriptionIdLast4: "CVJL" });
  });
  it("no customer: null last4", async () => {
    getCurrentUser.mockResolvedValue({ _id: "u2", subscription_plan: "free", subscription_status: "none", stripe_customer_id: null });
    const { GET } = await import("@/app/api/account/plan/route");
    expect((await (await GET()).json()).subscriptionIdLast4).toBeNull();
  });
});
