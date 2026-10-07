import { describe, expect, it } from "vitest";
import {
  passwordResetEmail,
  prepareOutboundMail,
  verificationEmail,
} from "@/lib/transactional-mail";

const VERIFY_URL =
  "https://aetherforgeai.co.nz/api/auth/verify-email?token=abc&callbackURL=%2Fverify-email";

describe("verification email", () => {
  it("pull-check:verification-email-html-and-text", () => {
    const payload = verificationEmail({
      to: "new.user@example.com",
      name: "Sam",
      url: VERIFY_URL,
    });

    expect(payload.to).toEqual(["new.user@example.com"]);
    expect(payload.subject).toBe("Verify your email to activate AetherForge AI");
    expect(payload.html.trim().length).toBeGreaterThan(0);
    expect(payload.text.trim().length).toBeGreaterThan(0);
    expect(payload.text).toContain(VERIFY_URL);
    expect(payload.html).toContain(VERIFY_URL.replace(/&/g, "&amp;"));
    expect(payload.html).toContain("https://aetherforgeai.co.nz/api/auth/verify-email?token=abc");
    expect(payload.html).not.toContain("SetUp Email");
    expect(payload.text).not.toContain("SetUp Email");
    expect(`${payload.html}\n${payload.text}`).not.toMatch(/\b(Grok|xAI|OpenAI|Anthropic|Claude|Gemini)\b/);
    expect(payload.html).not.toMatch(/\sstyle\s*=/);
    expect(payload.text).toContain("Verify My Email");
  });

  it("uses the auth library url when it is already absolute", () => {
    const payload = verificationEmail({
      to: "a@b.co",
      url: "https://preview.example/api/auth/verify-email?token=xyz",
    });
    expect(payload.text).toContain("https://preview.example/api/auth/verify-email?token=xyz");
    expect(payload.text).not.toContain("aetherforgeai.co.nz");
  });
});

describe("other transactional mail", () => {
  it("gives the password reset the same html and text parts", () => {
    const url = "https://aetherforgeai.co.nz/api/auth/reset-password/TOKEN?callbackURL=/reset-password";
    const payload = passwordResetEmail({ to: "a@b.co", name: "Sam", url });
    expect(payload.html.trim().length).toBeGreaterThan(0);
    expect(payload.text.trim().length).toBeGreaterThan(0);
    expect(payload.text).toContain(url);
    expect(payload.html).toContain(url);
    expect(payload.html).not.toContain("SetUp Email");
    expect(payload.text).not.toContain("SetUp Email");
  });

  it("keeps a link when the source html only had inline styles", () => {
    const url = "https://aetherforgeai.co.nz/reports/1";
    const prepared = prepareOutboundMail({
      to: ["a@b.co"],
      subject: "Your report",
      html: `<p style="color:#111"><a href="${url}" style="color:#111">Open the report</a></p>`,
    });
    expect(prepared.html).not.toMatch(/\sstyle\s*=/);
    expect(prepared.html).toContain(url);
    expect(prepared.text).toContain(url);
    expect(prepared.text).not.toContain("SetUp Email");
  });
});
