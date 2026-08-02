/**
 * Shared onboarding content for the standalone /website-design service.
 *
 * These plain-text blocks are the single source of truth for:
 *  1. The "Client Onboarding Resources" section on the page (copy-ready text).
 *  2. The welcome email that is sent to a prospective client after they submit
 *     the enquiry form (see /api/website-design/enquiry).
 *
 * This module is intentionally free of any server-only imports so it can be
 * imported from both the client component and the server API route.
 */

export const STUDIO_NAME = "AetherForge AI";
export const STUDIO_EMAIL = "admin@aetherforgeai.co.nz";
export const STUDIO_SITE = "https://www.aetherforgeai.co.nz";

/** The nine design directions offered — kept in one place for reuse. */
export const DESIGN_STYLES: string[] = [
  "Executive Minimal",
  "Modern Professional",
  "Warm Elegant",
  "Bold Creative",
  "Luxury Dark Mode",
  "Clean Tech / SaaS",
  "Portfolio / Agency Showcase",
  "E-commerce Focused",
  "Custom / Other (fully tailored to your brief)",
];

/**
 * 1) The FORMAL WELCOME LETTER — the letter that lives inside the welcome
 *    email. Written to read beautifully on its own, too. `{{name}}` is
 *    replaced with the client's name where personalised; the copy-ready block
 *    on the page uses a friendly placeholder instead.
 */
export function buildWelcomeLetter(name = "there"): string {
  const greetingName = name && name.trim() ? name.trim() : "there";
  return `Dear ${greetingName},

Welcome — and thank you. It is a genuine pleasure to welcome you into a partnership with ${STUDIO_NAME}.

From this moment, I want you to think of us not as a supplier, but as a partner invested in your success. My commitment to you is simple and absolute: your website will be built exactly to your specifications. Every colour, every word, every interaction and every detail will reflect your business, your standards and your vision — not a template, and never a compromise.

To make sure the finished site feels unmistakably yours, you're welcome to choose from any of the following design directions — or blend them, or invent something entirely new:

  •  Executive Minimal — restrained, confident, quietly premium
  •  Modern Professional — clean, current and credible
  •  Warm Elegant — refined, inviting and human
  •  Bold Creative — expressive, memorable and distinctive
  •  Luxury Dark Mode — sophisticated, cinematic and high-end
  •  Clean Tech / SaaS — crisp, structured and product-focused
  •  Portfolio / Agency Showcase — visual, editorial and work-led
  •  E-commerce Focused — conversion-driven and effortless to buy from
  •  Custom / Other — a bespoke direction shaped entirely around your brief

Beyond beautiful design, ${STUDIO_NAME} builds intelligence directly into your website. I create custom AI bots — tailored assistants coded specifically for your business — that can be woven seamlessly into your site. They can answer customer questions around the clock, qualify and capture leads, guide visitors to the right product or service, book appointments, support your team behind a secure staff portal, and automate the repetitive work that quietly drains your time. Each bot is trained on your business, speaks in your tone, and is integrated so naturally that it feels like a considered part of the experience rather than a bolt-on.

Here is what happens next:

  1.  I will personally review the details you shared within one business day.
  2.  I'll reply with a few thoughtful questions and a clear, tailored proposal — scope, design direction, timeline and next steps.
  3.  Once you're happy, we secure your start date and I begin crafting your site.
  4.  You'll see progress early and often, with room to refine at every stage until it's exactly right.

Thank you for trusting me with something as important as how the world sees your business. I don't take that lightly, and I promise to repay it with care, craft and genuine partnership.

Warm regards,

The ${STUDIO_NAME} Team
${STUDIO_EMAIL}
${STUDIO_SITE}`;
}

/**
 * 2) The FULL WELCOME EMAIL — a complete, ready-to-send email that contains the
 *    formal letter inside it, wrapped with a subject line and a short intro.
 */
export function buildWelcomeEmailText(name = "there"): string {
  return `Subject: Welcome to ${STUDIO_NAME} — Your Enquiry Has Been Received

${buildWelcomeLetter(name)}

—
This message confirms that your enquiry has been safely received. There is nothing further you need to do right now — I will be in touch personally within one business day. If anything urgent comes up in the meantime, simply reply to this email and it will reach me directly.`;
}

/** Copy-ready placeholder versions for the on-page "Onboarding Resources". */
export const WELCOME_LETTER_TEMPLATE = buildWelcomeLetter("[Client Name]");
export const WELCOME_EMAIL_TEMPLATE = buildWelcomeEmailText("[Client Name]");

/**
 * HTML version of the welcome email actually sent to the client. Mirrors the
 * plain-text letter but presented in the page's warm, editorial identity.
 */
export function buildWelcomeEmailHtml(name = "there"): string {
  const greetingName = name && name.trim() ? name.trim() : "there";
  const styleItems = DESIGN_STYLES.map(
    (s) =>
      `<li style="margin:0 0 8px 0;color:#4A4237;font-size:15px;line-height:1.6;">${s}</li>`
  ).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#F7F1E8;">
  <div style="max-width:640px;margin:0 auto;padding:40px 24px;font-family:Georgia,'Times New Roman',serif;color:#2B2724;">
    <div style="background:#FFFDF9;border:1px solid #E6D9C4;border-radius:20px;padding:40px 36px;box-shadow:0 24px 50px -30px rgba(43,39,36,0.35);">
      <p style="margin:0 0 4px 0;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#9A7B44;font-family:Arial,Helvetica,sans-serif;">A partnership with</p>
      <h1 style="margin:0 0 24px 0;font-size:30px;color:#211E1B;font-weight:700;">${STUDIO_NAME}</h1>

      <p style="font-size:16px;line-height:1.7;color:#3B342B;">Dear ${greetingName},</p>
      <p style="font-size:16px;line-height:1.7;color:#3B342B;">Welcome — and thank you. It is a genuine pleasure to welcome you into a partnership with ${STUDIO_NAME}.</p>
      <p style="font-size:16px;line-height:1.7;color:#3B342B;">From this moment, I want you to think of us not as a supplier, but as a partner invested in your success. My commitment to you is simple and absolute: <strong style="color:#9A7B44;">your website will be built exactly to your specifications</strong> — every colour, every word and every detail reflecting your business and your vision. Never a template, and never a compromise.</p>

      <p style="font-size:16px;line-height:1.7;color:#3B342B;margin-bottom:6px;">To make it unmistakably yours, choose from any of these design directions — or blend them, or invent something new:</p>
      <ul style="margin:0 0 20px 0;padding-left:20px;font-family:Arial,Helvetica,sans-serif;">${styleItems}</ul>

      <p style="font-size:16px;line-height:1.7;color:#3B342B;">Beyond beautiful design, ${STUDIO_NAME} builds intelligence directly into your website. I create <strong style="color:#9A7B44;">custom AI bots</strong> — tailored assistants coded specifically for your business — that integrate seamlessly into your site. They can answer customer questions around the clock, qualify and capture leads, guide visitors to the right service, book appointments, power a secure staff portal and automate the repetitive work that quietly drains your time. Each bot is trained on your business, speaks in your tone, and feels like a natural part of the experience.</p>

      <p style="font-size:16px;line-height:1.7;color:#3B342B;margin-bottom:6px;"><strong>Here is what happens next:</strong></p>
      <ol style="margin:0 0 20px 0;padding-left:20px;font-family:Arial,Helvetica,sans-serif;color:#4A4237;font-size:15px;line-height:1.7;">
        <li style="margin-bottom:8px;">I will personally review your details within one business day.</li>
        <li style="margin-bottom:8px;">I'll reply with a few thoughtful questions and a clear, tailored proposal — scope, design direction, timeline and next steps.</li>
        <li style="margin-bottom:8px;">Once you're happy, we secure your start date and I begin crafting your site.</li>
        <li style="margin-bottom:8px;">You'll see progress early and often, with room to refine at every stage until it's exactly right.</li>
      </ol>

      <p style="font-size:16px;line-height:1.7;color:#3B342B;">Thank you for trusting me with something as important as how the world sees your business. I promise to repay it with care, craft and genuine partnership.</p>

      <p style="font-size:16px;line-height:1.7;color:#3B342B;margin-bottom:2px;">Warm regards,</p>
      <p style="font-size:16px;line-height:1.5;color:#211E1B;margin-top:0;"><strong>The ${STUDIO_NAME} Team</strong><br/>
      <a href="mailto:${STUDIO_EMAIL}" style="color:#9A7B44;text-decoration:none;">${STUDIO_EMAIL}</a><br/>
      <a href="${STUDIO_SITE}" style="color:#9A7B44;text-decoration:none;">${STUDIO_SITE}</a></p>

      <hr style="border:none;border-top:1px solid #EFE4D2;margin:28px 0 18px 0;" />
      <p style="font-size:13px;line-height:1.6;color:#8A7E6E;font-family:Arial,Helvetica,sans-serif;">This message confirms that your enquiry has been safely received. There is nothing further you need to do right now — I will be in touch personally within one business day. If anything urgent comes up, simply reply to this email and it will reach me directly.</p>
    </div>
  </div>
</body>
</html>`;
}
