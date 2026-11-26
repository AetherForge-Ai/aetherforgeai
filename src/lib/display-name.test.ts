import { describe, expect, it } from "vitest";
import {
  DISPLAY_NAME_FALLBACK,
  DISPLAY_NAME_MAX,
  presentAccountNames,
  sanitizeDisplayName,
  sanitizeNameFields,
  sanitizeRenderedName,
} from "@/lib/display-name";
import { passwordResetEmail, verificationEmail } from "@/lib/transactional-mail";
import { renderActivityEmail } from "@/lib/activity-email";
import { seatInviteEmail } from "@/lib/ultimate/core";

const CLEAN = "Seán O'Brien-Ngata";

describe("sanitizeDisplayName", () => {
  it("leaves real names unchanged, including accents, apostrophes, hyphens and CJK", () => {
    for (const name of [CLEAN, "Anne-Marie", "José Muñoz", "李明", "佐藤", "Aroha Ngata", "Lukas Southey", "AetherForge 1T", "Test UserAF", "Dr. Smith", "Jr.", "Dot Ngata", "Mary dot Ngata"]) {
      expect(sanitizeDisplayName(name)).toBe(name);
      expect(sanitizeDisplayName(sanitizeDisplayName(name))).toBe(name);
    }
  });

  it("strips a moved-to URL lure and the instruction to log in there", () => {
    const cleaned = sanitizeDisplayName("AetherForge has moved to evil-site.com, log in there");
    expect(cleaned).toBe("AetherForge");
    expect(cleaned).not.toMatch(/evil|http|moved|log in/i);
  });

  it("replaces bare domains, obfuscations, emails and schemes with the safe default", () => {
    for (const lure of [
      "evil-site.com",
      "evil[.]com",
      "evil (.) com",
      "evil dot com",
      "evil dot co dot nz",
      "https://evil.com/login",
      "hxxps://evil.com/login",
      "www.evil.com",
      "phish@evil.com",
      "user @ evil.com",
      "mail (at) evil.com",
      "mail at evil.com",
      "javascript:alert(1)",
      "203.0.113.10",
      "site has moved",
      "please log in at",
      "visit us at",
    ]) {
      const cleaned = sanitizeDisplayName(lure);
      expect(cleaned, lure).toBe(DISPLAY_NAME_FALLBACK);
      expect(cleaned).not.toMatch(/evil|http|@|javascript/i);
    }
  });

  it("removes zero-width and bidi tricks before looking for a domain", () => {
    expect(sanitizeDisplayName(`evil\u200B.com`)).toBe(DISPLAY_NAME_FALLBACK);
    expect(sanitizeDisplayName(`\u202Eevil.com\u202C`)).toBe(DISPLAY_NAME_FALLBACK);
    expect(sanitizeDisplayName(`Seán\u200B O'Brien-Ngata`)).toBe(CLEAN);
    expect(sanitizeDisplayName("evil．com")).toBe(DISPLAY_NAME_FALLBACK);
    expect(sanitizeDisplayName("evil。com")).toBe(DISPLAY_NAME_FALLBACK);
  });

  it("caps at 40 characters and falls back when nothing usable remains", () => {
    expect(sanitizeDisplayName("A".repeat(80))).toBe("A".repeat(DISPLAY_NAME_MAX));
    expect(sanitizeDisplayName("A".repeat(DISPLAY_NAME_MAX))).toBe("A".repeat(DISPLAY_NAME_MAX));
    for (const empty of ["", "   ", "...", "https://evil.com", "<script>alert(1)</script>", null, undefined, 12]) {
      expect(sanitizeDisplayName(empty)).toBe(DISPLAY_NAME_FALLBACK);
    }
    expect(sanitizeRenderedName("")).toBe("");
    expect(sanitizeRenderedName("   ")).toBe("");
    expect(sanitizeRenderedName("evil.com")).toBe(DISPLAY_NAME_FALLBACK);
  });

  it("rejects any domain or email, including uncommon TLDs, confusables and a cut that reveals a host", () => {
    expect(sanitizeDisplayName("AetherForge moved: aetherforge-nz.help")).toBe("AetherForge");
    expect(sanitizeDisplayName("support@aetherforge.help")).toBe(DISPLAY_NAME_FALLBACK);
    expect(sanitizeDisplayName("aetherforge-nz.zip")).toBe(DISPLAY_NAME_FALLBACK);
    expect(sanitizeDisplayName("login.aetherforge.mov")).toBe(DISPLAY_NAME_FALLBACK);
    expect(sanitizeDisplayName("see aetherforge.page")).toBe("see");
    expect(sanitizeDisplayName("help.aetherforge.support")).toBe(DISPLAY_NAME_FALLBACK);

    const cyrillicO = "evil.c\u043Em";
    expect(sanitizeDisplayName(cyrillicO)).toBe(DISPLAY_NAME_FALLBACK);
    expect(sanitizeDisplayName("\u0441\u0430\u0439\u0442.\u0440\u0444")).toBe(DISPLAY_NAME_FALLBACK);
    expect(sanitizeDisplayName("aetherforge.\u0440\u0444")).toBe(DISPLAY_NAME_FALLBACK);
    expect(sanitizeDisplayName("evil.c\u034Fom")).toBe(DISPLAY_NAME_FALLBACK);
    expect(sanitizeDisplayName("evil.c\u3164om")).toBe(DISPLAY_NAME_FALLBACK);
    expect(sanitizeDisplayName("evil.c\uFE0Fom")).toBe(DISPLAY_NAME_FALLBACK);

    const clipped = `${"A".repeat(31)} evil.comXYZ`;
    const stored = sanitizeDisplayName(clipped);
    expect(stored).not.toMatch(/evil\.com/i);
    expect(stored).not.toContain(".");
    expect(Array.from(stored).length).toBeLessThanOrEqual(DISPLAY_NAME_MAX);
    expect(sanitizeDisplayName(stored)).toBe(stored);
    expect(sanitizeDisplayName(sanitizeDisplayName(clipped))).toBe(stored);
  });

  it("keeps real names in Latin, Māori, Cyrillic, Arabic, Devanagari and Persian", () => {
    const names = [
      "Wei K. Ng",
      "Hōne Wiremu",
      "Māui Tāne",
      "Анна Петрова",
      "فاطمة علي",
      "अर्जुन शर्मा",
      "علی\u200Cاکبر",
      "क\u200Dष",
    ];
    for (const name of names) {
      expect(sanitizeDisplayName(name), name).toBe(name);
      expect(sanitizeDisplayName(sanitizeDisplayName(name)), name).toBe(name);
    }
  });

  it("blocks spaced dots, dot-like characters and mixed-case 'dot' hosts", () => {
    for (const lure of [
      "aetherforge-nz . help",
      "evil .com",
      "evil. com",
      "aetherforge-nz\u2219help",
      "evil\u22C5com",
      "evil\uA4F8com",
      "evil\u0660com",
      "evil\u06F0com",
      "evil\u2024com",
      "Evil dot Com",
      "AetherForge-NZ dot Help",
    ]) {
      const cleaned = sanitizeDisplayName(lure);
      expect(cleaned, lure).not.toMatch(/help|evil\.?\s*com|aetherforge/i);
      expect(cleaned, lure).not.toContain(".");
      expect(sanitizeDisplayName(cleaned), lure).toBe(cleaned);
    }
    expect(sanitizeDisplayName("aetherforge-nz . help")).toBe(DISPLAY_NAME_FALLBACK);
    expect(sanitizeDisplayName("evil .com")).toBe(DISPLAY_NAME_FALLBACK);
    expect(sanitizeDisplayName("evil. com")).toBe(DISPLAY_NAME_FALLBACK);
  });

  it("keeps initials, titles, middle-dot names and 'at' that is not an email", () => {
    for (const name of [
      "J.R. Smith",
      "J.R.R. Tolkien",
      "J.R.",
      "Dr.Smith",
      "Dr. Smith",
      "Mr. Smith",
      "Mrs. Smith",
      "Ms. Ng",
      "St. John",
      "Jr.",
      "Sr.",
      "Prof. Ngata",
      "Ng.Wei",
      "约翰·史密斯",
      "Marcel·la Puig",
      "Kim at St. John",
    ]) {
      expect(sanitizeDisplayName(name), name).toBe(name);
      expect(sanitizeDisplayName(sanitizeDisplayName(name)), name).toBe(name);
    }
    expect(sanitizeDisplayName("Kim at St. John")).not.toContain("@");
  });

  it("strips annotation and Arabic sign characters, and combining marks inside a host", () => {
    expect(sanitizeDisplayName("Tāne\uFFF9")).toBe("Tāne");
    expect(sanitizeDisplayName("Hōne\uFFFAWiremu")).toBe("HōneWiremu");
    expect(sanitizeDisplayName("Ana\uFFFB Lee")).toBe("Ana Lee");
    expect(sanitizeDisplayName("evil\u0600.com")).toBe(DISPLAY_NAME_FALLBACK);
    expect(sanitizeDisplayName("evil\u0605.com")).toBe(DISPLAY_NAME_FALLBACK);
    expect(sanitizeDisplayName("evil\u0307.com")).toBe(DISPLAY_NAME_FALLBACK);
    expect(sanitizeDisplayName(sanitizeDisplayName("evil\u0307.com"))).toBe(DISPLAY_NAME_FALLBACK);
  });

  it("is idempotent and only rewrites name fields that are present", () => {
    const row = sanitizeNameFields({ name: "evil.com", first_name: CLEAN, email: "a@b.co", country: "NZ" });
    expect(row).toEqual({ name: DISPLAY_NAME_FALLBACK, first_name: CLEAN, email: "a@b.co", country: "NZ" });
    expect(sanitizeNameFields(row)).toEqual(row);
    expect(sanitizeNameFields({ emailVerified: true })).toEqual({ emailVerified: true });
    expect(presentAccountNames({ name: "", first_name: null, last_name: "李明" })).toEqual({
      name: "",
      first_name: null,
      last_name: "李明",
    });
  });
});

describe("names in email", () => {
  it("HTML-escapes a sanitised name and keeps it out of the subject", () => {
    const lure = `AetherForge has moved to evil-site.com, log in there <script>`;
    const verify = verificationEmail({ to: "a@b.co", name: lure, url: "https://aetherforgeai.co.nz/verify" });
    expect(verify.subject).not.toMatch(/evil|script|moved/i);
    expect(verify.html).not.toContain("evil-site.com");
    expect(verify.html).not.toContain("<script>");
    expect(verify.text).not.toContain("evil-site.com");
    expect(verify.html).toContain("AetherForge");

    const helpHost = verificationEmail({
      to: "a@b.co",
      name: "AetherForge moved: aetherforge-nz.help",
      url: "https://aetherforgeai.co.nz/verify",
    });
    expect(helpHost.text).toContain("Hi AetherForge,");
    expect(helpHost.text).not.toContain(".help");
    expect(helpHost.html).not.toContain(".help");
    expect(helpHost.html).not.toContain("aetherforge-nz");

    const helpMail = verificationEmail({
      to: "a@b.co",
      name: "support@aetherforge.help",
      url: "https://aetherforgeai.co.nz/verify",
    });
    expect(helpMail.text).toContain(`Hi ${DISPLAY_NAME_FALLBACK},`);
    expect(helpMail.text).not.toContain("support@");
    expect(helpMail.text).not.toContain(".help");
    expect(helpMail.html).not.toContain("aetherforge.help");

    const reset = passwordResetEmail({ to: "a@b.co", name: "phish@evil.com", url: "https://aetherforgeai.co.nz/reset" });
    expect(reset.html).not.toContain("phish@evil.com");
    expect(reset.html).toContain(DISPLAY_NAME_FALLBACK);
    expect(reset.subject).not.toContain("@");

    const activity = renderActivityEmail({ kind: "welcome", to: "member@example.com", name: "www.evil.com" });
    expect(activity.subject).toBe("Welcome to AetherForge AI");
    expect(activity.html).not.toContain("evil.com");
    expect(activity.text).toContain(`Kia ora ${DISPLAY_NAME_FALLBACK}`);
    expect(activity.html).toContain(`Kia ora ${DISPLAY_NAME_FALLBACK}`);

    const invite = seatInviteEmail({
      ownerName: "Visit at evil.com",
      portfolioName: "Client A",
      role: "viewer",
      acceptUrl: "https://example.test/accept",
    });
    expect(invite.subject).toBe(`${DISPLAY_NAME_FALLBACK} invited you to a portfolio on AetherForge AI`);
    expect(invite.text).not.toContain("evil.com");
    expect(invite.html).not.toContain("evil.com");
    expect(invite.html).not.toContain("<script");
    expect(invite.text).toContain("cannot change anything");
  });
});
