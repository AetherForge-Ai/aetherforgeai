import { NextResponse } from "next/server";
import { z } from "zod";
import { totalumSdk } from "@/lib/totalum";
import {
  STUDIO_EMAIL,
  STUDIO_NAME,
  buildWelcomeEmailHtml,
} from "@/lib/website-design-content";

/**
 * Public enquiry endpoint for the standalone /website-design services page.
 *
 * Anyone (logged-in or not) may submit — this is a marketing lead form. The
 * submission is stored in the `website_design_enquiry` table so it can be read
 * and managed from the Totalum back-office. On success we:
 *   1. Upload any attached files to Totalum storage.
 *   2. Create the enquiry record.
 *   3. Send the prospect a warm, formal welcome email.
 *   4. Send an internal notification to the studio inbox.
 *
 * Steps 3 & 4 are best-effort: if email delivery fails the lead is still saved
 * and the user still gets a success response (the error is logged, not hidden).
 */

/** Optional single attachment sent from the browser as base64. */
const attachmentSchema = z.object({
  filename: z.string().trim().min(1).max(200),
  contentType: z.string().trim().max(150).optional(),
  // Raw base64 (no data-URL prefix). Capped to keep payloads sane (~8MB binary).
  base64: z.string().min(1).max(12_000_000),
});

const enquirySchema = z.object({
  full_name: z.string().trim().min(1, "Please enter your full name").max(160),
  email: z.string().trim().email("Please enter a valid email address").max(200),
  phone: z.string().trim().max(60).optional().default(""),
  company_name: z.string().trim().max(200).optional().default(""),
  website_purpose: z.string().trim().max(5000).optional().default(""),
  interested_package: z.enum([
    "standard_professional",
    "premium_business",
    "ultimate_custom",
    "not_sure",
  ]),
  design_styles: z.array(z.string().trim().max(60)).max(20).optional().default([]),
  custom_style_note: z.string().trim().max(1000).optional().default(""),
  required_features: z.array(z.string().trim().max(60)).max(20).optional().default([]),
  other_feature_note: z.string().trim().max(1000).optional().default(""),
  budget_range: z
    .enum(["under_1500", "1500_3000", "3000_6000", "6000_plus", "prefer_discuss", ""])
    .optional()
    .default(""),
  timeline: z.string().trim().max(200).optional().default(""),
  additional_notes: z.string().trim().max(5000).optional().default(""),
  attachments: z.array(attachmentSchema).max(6).optional().default([]),
});

/** Human-readable labels for the internal notification email. */
const PACKAGE_LABELS: Record<string, string> = {
  standard_professional: "Standard Professional",
  premium_business: "Premium Business (incl. Customer Login Portal)",
  ultimate_custom: "Ultimate Custom (fully tailored + AI + dual portals)",
  not_sure: "Not sure yet — please advise",
};
const BUDGET_LABELS: Record<string, string> = {
  under_1500: "Under $1,500",
  "1500_3000": "$1,500 – $3,000",
  "3000_6000": "$3,000 – $6,000",
  "6000_plus": "$6,000+",
  prefer_discuss: "Prefer to discuss",
};
const STYLE_LABELS: Record<string, string> = {
  executive_minimal: "Executive Minimal",
  modern_professional: "Modern Professional",
  warm_elegant: "Warm Elegant",
  bold_creative: "Bold Creative",
  luxury_dark_mode: "Luxury Dark Mode",
  clean_tech_saas: "Clean Tech / SaaS",
  portfolio_agency: "Portfolio / Agency Showcase",
  ecommerce_focused: "E-commerce Focused",
  custom_other: "Custom / Other",
};
const FEATURE_LABELS: Record<string, string> = {
  ai_chatbot: "AI Chatbot",
  customer_login_portal: "Customer Login Portal",
  staff_login_portal: "Staff Login Portal",
  online_booking: "Online Booking / Appointments",
  ecommerce_payments: "E-commerce / Payments",
  blog_news: "Blog / News Section",
  other: "Other",
};

function labelList(values: string[], map: Record<string, string>): string {
  if (!values.length) return "—";
  return values.map((v) => map[v] || v).join(", ");
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as unknown;
    const parsed = enquirySchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || "Invalid submission";
      console.warn("[api/website-design/enquiry] Validation failed:", firstError);
      return NextResponse.json({ ok: false, error: firstError }, { status: 400 });
    }

    const d = parsed.data;
    console.log(
      `[api/website-design/enquiry] New enquiry from ${d.email} (${d.full_name}) · package=${d.interested_package} · files=${d.attachments.length}`
    );

    // 1) Upload attachments (best-effort per file) ------------------------------
    const uploadedFiles: { name: string }[] = [];
    for (const att of d.attachments) {
      try {
        const binaryStr = atob(att.base64);
        const len = binaryStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = binaryStr.charCodeAt(i);
        const blob = new Blob([bytes], { type: att.contentType || "application/octet-stream" });

        const formData = new FormData();
        formData.append("file", blob, att.filename);
        const uploadResult = await totalumSdk.files.uploadFile(formData);
        if (uploadResult?.errors) {
          console.error("[api/website-design/enquiry] File upload SDK error:", uploadResult.errors);
        }
        const fileNameId = uploadResult?.data;
        if (fileNameId) {
          uploadedFiles.push({ name: fileNameId as string });
          console.log(`[api/website-design/enquiry] Uploaded attachment "${att.filename}" → ${fileNameId}`);
        }
      } catch (fileErr) {
        // A single bad file must not sink the whole enquiry — log and continue.
        console.error(`[api/website-design/enquiry] Failed to upload "${att.filename}":`, fileErr);
      }
    }

    // 2) Persist the enquiry ----------------------------------------------------
    const record: Record<string, unknown> = {
      full_name: d.full_name,
      email: d.email,
      phone: d.phone,
      company_name: d.company_name,
      website_purpose: d.website_purpose,
      interested_package: d.interested_package,
      design_styles: d.design_styles,
      custom_style_note: d.custom_style_note,
      required_features: d.required_features,
      other_feature_note: d.other_feature_note,
      timeline: d.timeline,
      additional_notes: d.additional_notes,
      status: "new",
      source: "website_design_page",
    };
    if (d.budget_range) record.budget_range = d.budget_range;
    if (uploadedFiles.length) record.attachments = uploadedFiles;

    const created = await totalumSdk.crud.createRecord("website_design_enquiry", record);
    if (created?.errors) {
      console.error("[api/website-design/enquiry] createRecord SDK error:", created.errors);
      throw new Error(created.errors.errorMessage || "Could not save your enquiry");
    }
    console.log(`[api/website-design/enquiry] Stored enquiry ${created?.data?._id ?? "(no id)"}`);

    // 3) Welcome email to the prospect (best-effort) ----------------------------
    try {
      await totalumSdk.email.sendEmail({
        to: [d.email],
        subject: `Welcome to ${STUDIO_NAME} — Your Enquiry Has Been Received`,
        fromName: STUDIO_NAME,
        replyTo: STUDIO_EMAIL,
        html: buildWelcomeEmailHtml(d.full_name),
      });
      console.log(`[api/website-design/enquiry] Welcome email sent to ${d.email}`);
    } catch (mailErr) {
      console.error("[api/website-design/enquiry] Welcome email failed:", mailErr);
    }

    // 4) Internal notification to the studio inbox (best-effort) -----------------
    try {
      const attachmentsLine = uploadedFiles.length
        ? `${uploadedFiles.length} file(s) attached — view them on the enquiry record in Totalum.`
        : "No files attached.";
      await totalumSdk.email.sendEmail({
        to: [STUDIO_EMAIL],
        subject: `New Website Design enquiry — ${d.full_name}`,
        fromName: `${STUDIO_NAME} · Enquiries`,
        replyTo: d.email,
        html: `
          <div style="font-family:Arial,Helvetica,sans-serif;color:#2B2724;max-width:640px;margin:0 auto;">
            <h2 style="color:#9A7B44;">New Website Design enquiry</h2>
            <table style="border-collapse:collapse;width:100%;font-size:14px;">
              <tr><td style="padding:6px 10px;font-weight:bold;">Name</td><td style="padding:6px 10px;">${d.full_name}</td></tr>
              <tr><td style="padding:6px 10px;font-weight:bold;">Email</td><td style="padding:6px 10px;">${d.email}</td></tr>
              <tr><td style="padding:6px 10px;font-weight:bold;">Phone</td><td style="padding:6px 10px;">${d.phone || "—"}</td></tr>
              <tr><td style="padding:6px 10px;font-weight:bold;">Company</td><td style="padding:6px 10px;">${d.company_name || "—"}</td></tr>
              <tr><td style="padding:6px 10px;font-weight:bold;">Package</td><td style="padding:6px 10px;">${PACKAGE_LABELS[d.interested_package] || d.interested_package}</td></tr>
              <tr><td style="padding:6px 10px;font-weight:bold;">Budget</td><td style="padding:6px 10px;">${d.budget_range ? BUDGET_LABELS[d.budget_range] : "—"}</td></tr>
              <tr><td style="padding:6px 10px;font-weight:bold;">Timeline</td><td style="padding:6px 10px;">${d.timeline || "—"}</td></tr>
              <tr><td style="padding:6px 10px;font-weight:bold;">Design styles</td><td style="padding:6px 10px;">${labelList(d.design_styles, STYLE_LABELS)}${d.custom_style_note ? ` — ${d.custom_style_note}` : ""}</td></tr>
              <tr><td style="padding:6px 10px;font-weight:bold;">Features</td><td style="padding:6px 10px;">${labelList(d.required_features, FEATURE_LABELS)}${d.other_feature_note ? ` — ${d.other_feature_note}` : ""}</td></tr>
            </table>
            <h3 style="color:#9A7B44;margin-top:20px;">Purpose of website</h3>
            <p style="font-size:14px;line-height:1.6;white-space:pre-wrap;">${d.website_purpose || "—"}</p>
            <h3 style="color:#9A7B44;margin-top:16px;">Additional notes</h3>
            <p style="font-size:14px;line-height:1.6;white-space:pre-wrap;">${d.additional_notes || "—"}</p>
            <p style="font-size:13px;color:#8A7E6E;margin-top:16px;">${attachmentsLine}</p>
          </div>`,
      });
      console.log(`[api/website-design/enquiry] Internal notification sent to ${STUDIO_EMAIL}`);
    } catch (mailErr) {
      console.error("[api/website-design/enquiry] Internal notification failed:", mailErr);
    }

    return NextResponse.json({ ok: true, data: { id: created?.data?._id ?? null } });
  } catch (err: any) {
    console.error("[api/website-design/enquiry] POST error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to submit your enquiry" },
      { status: 500 }
    );
  }
}
