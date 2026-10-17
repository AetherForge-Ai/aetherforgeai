/**
 * Goal b11 Part A: CR-1 checkout auth + test mode.
 * pull-check:v3-goal-b11-2026-10-18
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const getCurrentUser = vi.fn();
vi.mock("@/lib/session", () => ({ getCurrentUser: () => getCurrentUser() }));
const create = vi.fn(async (params: any) => ({ id: "cs_test_x", url: "https://checkout.stripe.test/x", livemode: false, params }));
vi.mock("stripe", () => {
  class FakeStripe {
    checkout = { sessions: { create } };
    customers = { create: vi.fn() };
    static createFetchHttpClient() { return {}; }
    static createSubtleCryptoProvider() { return {}; }
  }
  return { default: FakeStripe };
});
vi.mock("@/lib/totalum", () => ({ totalumSdk: { crud: { editRecordById: vi.fn() } } }));

import { checkoutMode, stripeKeyType, testSecretKey, stripeModeSummary } from "@/lib/stripe-mode";

const post = (body: unknown) =>
  new Request("http://localhost/api/stripe/create-checkout-session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("CR-1 stripe mode", () => {
  it("defaults to test; live only with the explicit flag; never uses a live key in test", () => {
    expect(checkoutMode({})).toBe("test");
    expect(checkoutMode({ STRIPE_CHECKOUT_MODE: "live" })).toBe("live");
    expect(stripeKeyType("sk_live_abc")).toBe("live");
    expect(stripeKeyType("rk_test_abc")).toBe("test");
    expect(testSecretKey({ STRIPE_SECRET_KEY: "sk_live_abc" })).toBeNull();
    expect(testSecretKey({ STRIPE_SECRET_KEY: "sk_live_abc", STRIPE_TEST_SECRET_KEY: "sk_test_t" })).toBe("sk_test_t");
    const summary = JSON.stringify(stripeModeSummary({ STRIPE_SECRET_KEY: "sk_live_secretvalue" }));
    expect(summary).not.toContain("secretvalue");
    expect(summary).toContain('"defaultKeyType":"live"');
  });
});

describe("CR-1 create-checkout-session", () => {
  beforeEach(() => {
    vi.resetModules();
    create.mockClear();
    process.env.STRIPE_CHECKOUT_MODE = "";
    process.env.STRIPE_TEST_SECRET_KEY = "sk_test_unit";
  });

  it("anonymous → 401 and no Stripe call", async () => {
    getCurrentUser.mockResolvedValue(null);
    const { POST } = await import("@/app/api/stripe/create-checkout-session/route");
    const res = await POST(post({ plan: "starter_monthly" }));
    expect(res.status).toBe(401);
    expect(create).not.toHaveBeenCalled();
  });

  it("signed-in test mode echoes Starter monthly at 1600 NZD, customer from session", async () => {
    getCurrentUser.mockResolvedValue({ _id: "u1", email: "qa@example.test", name: "QA" });
    const { POST } = await import("@/app/api/stripe/create-checkout-session/route");
    const res = await POST(post({ plan: "starter_monthly", customerEmail: "attacker@example.test" }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.testMode).toBe(true);
    expect(json.data.unitAmount).toBe(1600);
    expect(json.data.currency).toBe("nzd");
    const params = create.mock.calls[0][0];
    expect(params.client_reference_id).toBe("u1");
    expect(params.customer_email).toBe("qa@example.test");
    expect(params.line_items[0].price_data.unit_amount).toBe(1600);
  });

  it("test mode with only a live key refuses (503) instead of going live", async () => {
    process.env.STRIPE_TEST_SECRET_KEY = "";
    const saved = process.env.STRIPE_SECRET_KEY;
    process.env.STRIPE_SECRET_KEY = "sk_live_unit";
    getCurrentUser.mockResolvedValue({ _id: "u1", email: "qa@example.test", name: "QA" });
    const { POST } = await import("@/app/api/stripe/create-checkout-session/route");
    const res = await POST(post({ plan: "starter_monthly" }));
    process.env.STRIPE_SECRET_KEY = saved;
    expect(res.status).toBe(503);
    expect(create).not.toHaveBeenCalled();
  });

  it("/api/stripe/checkout also requires sign-in", () => {
    expect(readFileSync("src/app/api/stripe/checkout/route.ts", "utf8")).toMatch(/if \(!user\) return NextResponse\.json\(\{ ok: false, error: "Unauthorized" \}, \{ status: 401 \}\)/);
  });
});

describe("CR-2 / CR-5 IPv6 /64 buckets", () => {
  it("rotating addresses inside one /64 share a key; /48 groups /64s; IPv4 unchanged", async () => {
    const { ipBucket, ipBucket48, rateLimitIdentity } = await import("@/lib/ip-rate-limit");
    expect(ipBucket("2a09:bac5:4ec0:12::1")).toBe("2a09:bac5:4ec0:12::/64");
    expect(ipBucket("2a09:bac5:4ec0:0012:abcd:ef01:2345:6789")).toBe("2a09:bac5:4ec0:12::/64");
    expect(ipBucket("2a09:bac5:4ec0:13::9")).not.toBe(ipBucket("2a09:bac5:4ec0:12::9"));
    expect(ipBucket48("2a09:bac5:4ec0:13::9")).toBe("2a09:bac5:4ec0::/48");
    expect(ipBucket("203.0.113.7")).toBe("203.0.113.7");
    expect(ipBucket("::ffff:203.0.113.7")).toBe("203.0.113.7");
    const r = (ip: string) => new Request("http://x/", { headers: { "cf-connecting-ip": ip } });
    expect(rateLimitIdentity(r("2a09:bac5:4ec0:12::aaaa"))).toEqual(rateLimitIdentity(r("2a09:bac5:4ec0:12:ffff::1")));
  });

  it("guide: 9 requests from 9 addresses in one /64 → the 7th is 429", async () => {
    const lim = await import("@/lib/ip-rate-limit");
    lim.resetRateLimits();
    const statuses: boolean[] = [];
    for (let i = 1; i <= 9; i++) {
      const id = lim.rateLimitIdentity(new Request("http://x/", { headers: { "cf-connecting-ip": `2a09:bac5:4ec0:77::${i.toString(16)}` } }));
      const res = await lim.takeRateLimit(`personal-guide:${(id as { ip: string }).ip}`, lim.PERSONAL_GUIDE_LIMIT, lim.PERSONAL_GUIDE_WINDOW_MS, 1_000_000);
      statuses.push(res.allowed);
    }
    expect(statuses.slice(0, 6).every(Boolean)).toBe(true);
    expect(statuses[6]).toBe(false);
  });

  it("sign-in has a per-email bucket that ignores the address", () => {
    const route = readFileSync("src/app/api/auth/[...all]/route.ts", "utf8");
    expect(route).toContain("login:email:");
    expect(route).not.toMatch(/auth:sign-in:email:\$\{encodeURIComponent\(ip\)/);
  });
});

describe("H-13 allow-list", () => {
  it("rejects TT's three off-scope headlines and keeps RBNZ/BHP/Wesfarmers", async () => {
    const { isNewsRelevant } = await import("@/lib/market-news");
    const no = [
      "Former Fed Chair Jerome Powell's 6-Word Warning Should Terrify Wall Street",
      "US inflation rises more than expected - here's what is happening with prices",
      "Six Banks Just Published Agentic Commerce Guardrails — But They're Voluntary",
    ];
    for (const headline of no) expect(isNewsRelevant({ headline, market: "Global", source: "Yahoo Finance" })).toBe(false);
    expect(isNewsRelevant({ headline: "RBNZ holds the OCR at 2.75%", market: "NZX" })).toBe(true);
    expect(isNewsRelevant({ headline: "BHP lifts copper output at Escondida", market: "Global" })).toBe(true);
    expect(isNewsRelevant({ headline: "Wesfarmers profit beats forecasts", market: "Global" })).toBe(true);
  });
});
