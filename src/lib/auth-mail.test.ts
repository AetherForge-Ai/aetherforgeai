import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const sendEmail = vi.hoisted(() => vi.fn());

vi.mock("@/lib/totalum", () => ({
  totalumSdk: {
    email: { sendEmail },
  },
}));

import { sendAuthResetPassword, sendAuthVerificationEmail } from "@/lib/auth-mail";

const VERIFY_URL =
  "https://aetherforgeai.co.nz/api/auth/verify-email?token=abc&callbackURL=%2Fverify-email";
const RESET_URL = "https://aetherforgeai.co.nz/api/auth/reset-password/TOKEN?callbackURL=/reset-password";

const rejected = {
  data: null,
  errors: { errorCode: "BAD_PAYLOAD", errorMessage: "unknown field" },
};

const user = { email: "new.user@example.com", name: "Sam" };

describe("auth mail callbacks", () => {
  beforeEach(() => {
    sendEmail.mockReset();
    sendEmail.mockResolvedValue(rejected);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("does not reject verification when sign-up mail fails", async () => {
    const request = new Request("https://aetherforgeai.co.nz/api/auth/sign-up/email", { method: "POST" });
    await expect(sendAuthVerificationEmail({ user, url: VERIFY_URL }, request)).resolves.toBeUndefined();
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("rethrows verification only for the explicit resend endpoint", async () => {
    const request = new Request("https://aetherforgeai.co.nz/api/auth/send-verification-email", {
      method: "POST",
    });
    await expect(sendAuthVerificationEmail({ user, url: VERIFY_URL }, request)).rejects.toThrow("unknown field");
  });

  it("never rejects password reset when the mailer returns errors", async () => {
    const request = new Request("https://aetherforgeai.co.nz/api/auth/forget-password", { method: "POST" });
    await expect(sendAuthResetPassword({ user, url: RESET_URL })).resolves.toBeUndefined();
    await expect(sendAuthResetPassword({ user, url: RESET_URL }, request)).resolves.toBeUndefined();
  });
});
