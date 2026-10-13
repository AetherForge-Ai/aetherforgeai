import { NextResponse } from "next/server";
import { z } from "zod";
import {
  clientIp,
  CONTACT_LIMIT,
  honeypotFilled,
  PUBLIC_INPUT_CAP,
  RATE_WINDOW_MS,
  takeRateLimit,
} from "@/lib/ip-rate-limit";
import { totalumSdk } from "@/lib/totalum";

/**
 * Public contact endpoint for the About / "Let's Connect" page.
 * Anyone (logged-in or not) may submit a message; it is stored in the
 * `contact_message` table so the team can read & reply from the Totalum
 * back-office. No auth is required — this is a marketing-site contact form.
 */
const contactSchema = z.object({
  name: z.string().trim().min(1, "Please tell us your name").max(120),
  email: z.string().trim().email("Please enter a valid email address").max(160),
  message: z.string().trim().min(1, "Please write a short message").max(PUBLIC_INPUT_CAP),
  website: z.string().max(200).optional(),
});

const CONTACT_LIMIT_MESSAGE =
  "That is enough messages from this network for now. Email admin@aetherforgeai.co.nz if it is urgent.";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as unknown;
    const parsed = contactSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || "Invalid submission";
      console.warn("[api/contact] Validation failed:", firstError);
      return NextResponse.json({ ok: false, error: firstError }, { status: 400 });
    }

    const { name, email, message, website } = parsed.data;
    const limit = takeRateLimit(`contact:${clientIp(req)}`, CONTACT_LIMIT, RATE_WINDOW_MS);
    if (!limit.allowed) {
      return NextResponse.json({ ok: false, error: CONTACT_LIMIT_MESSAGE }, { status: 429 });
    }
    if (honeypotFilled(website)) {
      console.log("[api/contact] Honeypot filled. Message was not stored.");
      return NextResponse.json({ ok: true, data: { accepted: true } });
    }

    const record = {
      name,
      email,
      message,
      status: "new",
      source: "about_page",
    };

    const result = await totalumSdk.crud.createRecord("contact_message", record);
    console.log(`[api/contact] Stored contact message from ${email} (${name}).`);

    return NextResponse.json({ ok: true, data: result?.data ?? record });
  } catch (err: any) {
    console.error("[api/contact] POST error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to send your message" },
      { status: 500 }
    );
  }
}
