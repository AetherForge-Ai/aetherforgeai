import { describe, expect, it, vi } from "vitest";
import { coerceUserRow, redactEmails, totalumErrorText } from "./totalum-user-row";
import { createUserWithConsentFallback } from "./signup-consent";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth-mail", () => ({ sendAuthResetPassword: async () => {}, sendAuthVerificationEmail: async () => {} }));
const sent: Record<string, unknown>[] = [];
let reply: unknown = { errors: { errorCode: "VALIDATION", errorMessage: "bad value for a@example.test" } };
vi.mock("@/lib/totalum", () => ({
  totalumSdk: { crud: {
    createRecord: async (_t: string, row: Record<string, unknown>) => { sent.push(row); return reply; },
    query: async () => ({ data: [] }),
    getRecords: async () => ({ data: [] }),
  } },
}));

describe("H-4/signup: user row coercion", () => {
  it("maps each value to the Totalum column type", () => {
    const at = new Date("2026-10-21T03:00:00.000Z");
    expect(coerceUserRow({
      email: "a@example.test", email_verified: false, ticker_limit: "5", cash_balance: true,
      age_confirmed: true, terms_version: 20261007, subscription_status: "none", onboarded: false,
      trial_used_at: at, subscription_started_at: "2026-10-21T03:00:00.000Z", country: undefined, image: null,
      createdAt: at,
    })).toEqual({
      email: "a@example.test", email_verified: 0, ticker_limit: 5, cash_balance: 1,
      age_confirmed: "yes", terms_version: "20261007", subscription_status: "none", onboarded: "no",
      trial_used_at: "2026-10-21T03:00:00.000Z", subscription_started_at: "2026-10-21T03:00:00.000Z",
      createdAt: at,
    });
    expect(coerceUserRow({ email_verified: true }).email_verified).toBe(1);
    expect(coerceUserRow({ email_verified: "true" }).email_verified).toBe(1);
    expect("ticker_limit" in coerceUserRow({ ticker_limit: "abc" })).toBe(false);
  });

  it("masks emails in Totalum error text", () => {
    expect(redactEmails("dup fixture-h4-500@example.test x")).toBe("dup f***@example.test x");
    expect(totalumErrorText({ errorMessage: "bad lukas@aetherforgeai.co.nz" })).not.toContain("lukas@");
    expect(totalumErrorText(new Error("boom a@b.co"))).toContain("a***@b.co");
  });

  it("logs the refusal reason with the email masked", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await createUserWithConsentFallback({ email: "x@example.test" }, async () => ({
      record: null, error: { errorCode: "E1", errorMessage: "rejected x@example.test" },
    }));
    expect(out).toBeNull();
    const line = err.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(line).toContain("E1");
    expect(line).toContain("x***@example.test");
    expect(line).not.toContain("x@example.test");
    err.mockRestore();
  });

  it("a real sign-up sends a type-correct row and logs the reason on a 422", async () => {
    process.env.BETTER_AUTH_SECRET = "t".repeat(40);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { auth } = await import("@/lib/auth");
    const res = await auth.handler(new Request("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ email: "fixture-g01@example.test", password: "pw-123456", name: "G", age_confirmed: true }),
    }));
    expect(res.status).toBe(422);
    const row = sent[0];
    expect(row.email_verified).toBe(0);
    expect(row.age_confirmed).toBe("yes");
    expect(typeof row.terms_accepted_at).toBe("string");
    expect(Object.values(row).some((v) => typeof v === "boolean")).toBe(false);
    const logged = err.mock.calls.map((c) => c.map(String).join(" ")).join("\n");
    expect(logged).toContain("[signup] Totalum user create refused");
    expect(logged).toContain("VALIDATION");
    expect(logged).not.toContain("fixture-g01@example.test");
    err.mockRestore();
  });

  it("a real sign-up succeeds when Totalum returns the record", async () => {
    reply = { data: { _id: "u1", email: "ok@example.test", name: "O", email_verified: 0 } };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { auth } = await import("@/lib/auth");
    const res = await auth.handler(new Request("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ email: "ok@example.test", password: "pw-123456", name: "O", age_confirmed: "yes" }),
    }));
    expect(res.status).not.toBe(422);
  });
});
