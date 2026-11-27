import { describe, expect, it } from "vitest";
import {
  DISPLAY_NAME_ERROR,
  DISPLAY_NAME_FALLBACK,
  DISPLAY_NAME_MAX,
  normalizeNameFields,
  presentAccountNames,
  sanitizeDisplayName,
  sanitizeRenderedName,
  validateDisplayName,
} from "@/lib/display-name";
import { passwordResetEmail, verificationEmail } from "@/lib/transactional-mail";
import { renderActivityEmail } from "@/lib/activity-email";
import { seatInviteEmail } from "@/lib/ultimate/core";

const CLEAN = "Seán O'Brien-Ngata";

describe("sanitizeDisplayName", () => {
  it("leaves real names unchanged, including accents, apostrophes, hyphens and CJK", () => {
    for (const name of [CLEAN, "Anne-Marie", "José Muñoz", "李明", "佐藤", "Aroha Ngata", "Lukas Southey", "AetherForge 1T", "Test UserAF", "Dr. Smith", "Dot Ngata"]) {
      expect(sanitizeDisplayName(name)).toBe(name);
      expect(sanitizeDisplayName(sanitizeDisplayName(name))).toBe(name);
    }
  });

  it("rejects a name that contains a web address instead of keeping the words around it", () => {
    const cleaned = sanitizeDisplayName("AetherForge has moved to evil-site.com, log in there");
    expect(cleaned).toBe(DISPLAY_NAME_FALLBACK);
    expect(validateDisplayName("AetherForge has moved to evil-site.com, log in there").ok).toBe(false);
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
      "https://evil.com/login",
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
    for (const empty of ["", "   ", "...", "https://evil.com", null, undefined, 12]) {
      expect(sanitizeDisplayName(empty)).toBe(DISPLAY_NAME_FALLBACK);
    }
    expect(sanitizeRenderedName("")).toBe("");
    expect(sanitizeRenderedName("   ")).toBe("");
    expect(sanitizeRenderedName("evil.com")).toBe(DISPLAY_NAME_FALLBACK);
  });

  it("rejects any domain or email, including uncommon TLDs, confusables and a cut that reveals a host", () => {
    expect(sanitizeDisplayName("AetherForge moved: aetherforge-nz.help")).toBe(DISPLAY_NAME_FALLBACK);
    expect(sanitizeDisplayName("support@aetherforge.help")).toBe(DISPLAY_NAME_FALLBACK);
    expect(sanitizeDisplayName("aetherforge-nz.zip")).toBe(DISPLAY_NAME_FALLBACK);
    expect(sanitizeDisplayName("login.aetherforge.mov")).toBe(DISPLAY_NAME_FALLBACK);
    expect(sanitizeDisplayName("see aetherforge.page")).toBe(DISPLAY_NAME_FALLBACK);
    expect(sanitizeDisplayName("help.aetherforge.support")).toBe(DISPLAY_NAME_FALLBACK);

    const cyrillicO = "evil.c\u043Em";
    expect(sanitizeDisplayName(cyrillicO)).toBe(DISPLAY_NAME_FALLBACK);
    expect(sanitizeDisplayName("ng.wei")).toBe(DISPLAY_NAME_FALLBACK);
    expect(validateDisplayName("j.mp").ok).toBe(false);
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

  it("accepts initials and titles, and rejects every other dot next to a letter", () => {
    const accepted = [
      "J. Smith",
      "Wei K. Ng",
      "J. R. R. Tolkien",
      "Juan C. de la Cruz",
      "Ana M. de Souza",
      "J. de Vries",
      "Anna T. To",
      "Mr. Smith",
      "Mrs. Smith",
      "Ms. Ng",
      "Dr. Smith",
      "Jr. Smith",
      "Sr. Smith",
      "St. John",
      "Prof. Ngata",
      "Kim at St. John",
    ];
    for (const name of accepted) {
      const result = validateDisplayName(name);
      expect(result.ok, name).toBe(true);
      if (result.ok) expect(result.name).toBe(name);
      expect(sanitizeDisplayName(name), name).toBe(name);
      expect(sanitizeDisplayName(sanitizeDisplayName(name)), name).toBe(name);
    }
    expect(sanitizeDisplayName("Kim at St. John")).not.toContain("@");

    const rejected = ["j.mp", "v.gd", "g.gl", "u.nu", "w.wiki", "ng.wei", "mary.jane smith", "evil.com", "Dr.Smith", "aetherforge-nz . help", "evil .com", "evil. com", "Mary dot Ngata", "evil (dot) com", "evil [dot] com"];
    for (const name of rejected) {
      const result = validateDisplayName(name);
      expect(result.ok, name).toBe(false);
      if (!result.ok) expect(result.error).toBe(DISPLAY_NAME_ERROR);
      expect(sanitizeDisplayName(name), name).toBe(DISPLAY_NAME_FALLBACK);
      expect(sanitizeDisplayName(sanitizeDisplayName(name)), name).toBe(DISPLAY_NAME_FALLBACK);
    }
  });

  it("N1 refuses a short host disguised as an initial", () => {
    for (const name of ["t. me/afnz_help", "x. com/", "m. me/", "j. mp/", "t. me", "Ana/Lee", "Ana\\Lee"]) {
      expect(validateDisplayName(name).ok, name).toBe(false);
      expect(sanitizeDisplayName(name), name).toBe(DISPLAY_NAME_FALLBACK);
    }
    for (const name of ["J. Smith", "J. de Vries", "Juan C. de la Cruz", "J. R. R. Tolkien", "Anna T. To", "Wei K. Ng"]) {
      expect(validateDisplayName(name), name).toEqual({ ok: true, name });
    }
  });

  it("N2 refuses IPv4 and IPv6 addresses", () => {
    expect(sanitizeDisplayName("203.0.113.10")).toBe(DISPLAY_NAME_FALLBACK);
    expect(validateDisplayName("203.0.113.10").ok).toBe(false);
    expect(sanitizeDisplayName("203\u30020\u3002113\u300210")).toBe(DISPLAY_NAME_FALLBACK);
    expect(validateDisplayName("2001:db8::1").ok).toBe(false);
    expect(validateDisplayName("fe80::1").ok).toBe(false);
    expect(sanitizeDisplayName("2001:db8:85a3::8a2e:370:7334")).toBe(DISPLAY_NAME_FALLBACK);
  });

  it("N3 refuses an Arabic-Indic zero used as a dot", () => {
    expect(validateDisplayName("evil\u0660com").ok).toBe(false);
    expect(sanitizeDisplayName("evil\u0660com")).toBe(DISPLAY_NAME_FALLBACK);
    expect(validateDisplayName("evil\u06F0com").ok).toBe(false);
    expect(sanitizeDisplayName("evil\u06F0com")).toBe(DISPLAY_NAME_FALLBACK);
  });

  it("N4 allows a trailing Jr. or Sr.", () => {
    for (const name of ["Martin Luther King Jr.", "Sammy Davis Sr.", "Martin Luther King Jr", "Sammy Davis Sr"]) {
      expect(validateDisplayName(name), name).toEqual({ ok: true, name });
      expect(sanitizeDisplayName(name), name).toBe(name);
    }
  });

  it("N5 refuses angle brackets", () => {
    expect(validateDisplayName("<script>alert(1)</script>").ok).toBe(false);
    expect(sanitizeDisplayName("<script>alert(1)</script>")).toBe(DISPLAY_NAME_FALLBACK);
    expect(validateDisplayName("Ann < Lee").ok).toBe(false);
    expect(validateDisplayName("Ann > Lee").ok).toBe(false);
  });

  it("N8 refuses enclosed letters used as a host", () => {
    const enclosed = validateDisplayName("🅴🅵🅸🅻.🅲🅾🅼");
    expect(enclosed.ok).toBe(false);
    if (!enclosed.ok) expect(enclosed.error).toBe(DISPLAY_NAME_ERROR);
    expect(sanitizeDisplayName("🅴🅵🅸🅻.🅲🅾🅼")).toBe(DISPLAY_NAME_FALLBACK);
    const marked = validateDisplayName("evil\u0307.\u0307com");
    expect(marked.ok).toBe(false);
    if (!marked.ok) expect(marked.error).toBe(DISPLAY_NAME_ERROR);
    expect(validateDisplayName("Ho\u0304ne Wiremu")).toEqual({ ok: true, name: "Hōne Wiremu" });
  });

  it("N9 strips U+08E2 and U+110CD", () => {
    expect(validateDisplayName("Hōne\u08E2 Wiremu")).toEqual({ ok: true, name: "Hōne Wiremu" });
    expect(validateDisplayName("Tāne\u{110CD}")).toEqual({ ok: true, name: "Tāne" });
    expect(validateDisplayName("evil\u08E2.com").ok).toBe(false);
    expect(validateDisplayName("evil\u{110CD}.com").ok).toBe(false);
  });

  it("rejects every listed dot-like character next to a letter", () => {
    const dots = [
      "\u00B7", "\u2024", "\u2027", "\u2E31", "\u2E33", "\u0701", "\u0702", "\uA60E",
      "\u{10A50}", "\u1427", "\uFF0E", "\uFE52", "\u3002", "\uFF61", "\u0589", "\u06D4",
      "\u30FB", "\u2219", "\u22C5", "\u2022", ".", "\u0660", "\u06F0",
    ];
    for (const dot of dots) {
      expect(validateDisplayName(`a${dot}b`).ok, `U+${dot.codePointAt(0)?.toString(16)}`).toBe(false);
      expect(sanitizeDisplayName(`a${dot}b`)).toBe(DISPLAY_NAME_FALLBACK);
    }
  });

  it("strips R7 invisibles and still rejects a host they were hiding", () => {
    expect(validateDisplayName("Hōne\u06DD Wiremu")).toEqual({ ok: true, name: "Hōne Wiremu" });
    expect(validateDisplayName("Tāne\u070F")).toEqual({ ok: true, name: "Tāne" });
    expect(sanitizeDisplayName("Hōne\uFFFAWiremu")).toBe("HōneWiremu");
    expect(sanitizeDisplayName("Ana\uFFFB Lee")).toBe("Ana Lee");
    expect(sanitizeDisplayName("Tāne\uFFF9")).toBe("Tāne");
    for (const hidden of ["\u06DD", "\u070F", "\u{110BD}", "\u{13430}", "\u0600", "\u0605", "\u034F", "\u0307"]) {
      expect(validateDisplayName(`evil${hidden}.com`).ok, hidden).toBe(false);
      expect(sanitizeDisplayName(`evil${hidden}.com`)).toBe(DISPLAY_NAME_FALLBACK);
    }
  });

  it("is idempotent and only rewrites name fields that are present", () => {
    expect(validateDisplayName("evil.com")).toEqual({ ok: false, error: DISPLAY_NAME_ERROR });
    expect(validateDisplayName(CLEAN)).toEqual({ ok: true, name: CLEAN });
    expect(presentAccountNames({ name: "evil.com", first_name: CLEAN, email: "a@b.co", country: "NZ" })).toEqual({
      name: DISPLAY_NAME_FALLBACK,
      first_name: CLEAN,
      email: "a@b.co",
      country: "NZ",
    });
    expect(normalizeNameFields({ emailVerified: true })).toEqual({ emailVerified: true });
    expect(() => normalizeNameFields({ name: "evil.com" })).toThrow(DISPLAY_NAME_ERROR);
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
    expect(verify.text).toContain(`Hi ${DISPLAY_NAME_FALLBACK},`);
    expect(verify.html).not.toContain("evil-site.com");

    const helpHost = verificationEmail({
      to: "a@b.co",
      name: "AetherForge moved: aetherforge-nz.help",
      url: "https://aetherforgeai.co.nz/verify",
    });
    expect(helpHost.text).toContain(`Hi ${DISPLAY_NAME_FALLBACK},`);
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
