import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const sendEmail = vi.hoisted(() => vi.fn());

vi.mock("@/lib/totalum", () => ({
  totalumSdk: {
    email: { sendEmail },
  },
}));

import { sendTransactionalEmail } from "@/lib/send-transactional-mail";
import { verificationEmail } from "@/lib/transactional-mail";

const VERIFY_URL =
  "https://aetherforgeai.co.nz/api/auth/verify-email?token=abc&callbackURL=%2Fverify-email";
const ESCAPED_URL = VERIFY_URL.replace(/&/g, "&amp;");

const accepted = {
  data: { success: true, message: "sent", messageId: "msg_1" },
  errors: null,
};

describe("sendTransactionalEmail", () => {
  beforeEach(() => {
    sendEmail.mockReset();
  });

  it("pull-check:verification-email-html-and-text", async () => {
    sendEmail.mockResolvedValueOnce(accepted);
    await sendTransactionalEmail(
      verificationEmail({ to: "new.user@example.com", name: "Sam", url: VERIFY_URL }),
    );

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const payload = sendEmail.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("text");
    expect(payload).not.toHaveProperty("from");
    expect(payload.to).toEqual(["new.user@example.com"]);
    expect(payload.subject).toBe("Verify your email to activate AetherForge AI");
    expect(payload.fromName).toBe("AetherForge AI");
    const html = String(payload.html);
    expect(html).toContain(`href="${ESCAPED_URL}"`);
    expect(html).toContain(`<p>${ESCAPED_URL}</p>`);
    expect(html).not.toMatch(/\sstyle\s*=/);
    expect(html).not.toContain("SetUp Email");
  });

  it("surfaces an errors result as a failure", async () => {
    sendEmail.mockResolvedValueOnce({
      data: null,
      errors: { errorCode: "BAD_PAYLOAD", errorMessage: "unknown field" },
    });
    await expect(
      sendTransactionalEmail(verificationEmail({ to: "a@b.co", url: VERIFY_URL })),
    ).rejects.toThrow("unknown field");
  });

  it("surfaces a missing result as a failure", async () => {
    sendEmail.mockResolvedValueOnce(undefined);
    await expect(
      sendTransactionalEmail(verificationEmail({ to: "a@b.co", url: VERIFY_URL })),
    ).rejects.toThrow("Email sender returned no result.");
  });
});
