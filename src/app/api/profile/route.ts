import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { totalumSdk } from "@/lib/totalum";

const imageSchema = z
  .string()
  .max(900_000, "Image is too large — try a smaller photo")
  .refine(
    (v) =>
      v === "" ||
      v.startsWith("data:image/") ||
      /^https?:\/\//i.test(v),
    "Image must be a URL or an uploaded image",
  )
  .nullable()
  .optional();

const schema = z.object({
  name: z.string().min(1, "Name is required").max(120).optional(),
  first_name: z.string().min(1, "First name is required").max(60).optional(),
  last_name: z.string().min(1, "Last name is required").max(60).optional(),
  country: z.string().min(1, "Country is required").max(80).optional(),
  phone: z.string().max(40).optional().nullable(),
  secondary_email: z
    .string()
    .email("Enter a valid backup email")
    .or(z.literal(""))
    .nullable()
    .optional(),
  image: imageSchema,
});

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ ok: true, data: user });
  } catch (err: any) {
    console.error("[api/profile] GET error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as unknown;
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const patch: Record<string, unknown> = {};
    if (parsed.data.first_name !== undefined) patch.first_name = parsed.data.first_name.trim();
    if (parsed.data.last_name !== undefined) patch.last_name = parsed.data.last_name.trim();
    if (parsed.data.country !== undefined) patch.country = parsed.data.country.trim();
    if (parsed.data.phone !== undefined) patch.phone = (parsed.data.phone || "").trim() || null;
    if (parsed.data.secondary_email !== undefined) {
      patch.secondary_email = (parsed.data.secondary_email || "").trim() || null;
    }
    if (parsed.data.image !== undefined) patch.image = parsed.data.image || null;

    const first = (patch.first_name as string | undefined) ?? user.first_name ?? "";
    const last = (patch.last_name as string | undefined) ?? user.last_name ?? "";
    if (parsed.data.name !== undefined) {
      patch.name = parsed.data.name.trim();
    } else if (parsed.data.first_name !== undefined || parsed.data.last_name !== undefined) {
      const combined = `${first} ${last}`.trim();
      if (combined) patch.name = combined;
    }

    if (Object.keys(patch).length > 0) {
      await totalumSdk.crud.editRecordById("user", user._id, patch);
      console.log(`[api/profile] Updated profile for user ${user._id}`);
    }

    return NextResponse.json({ ok: true, data: { ...user, ...patch } });
  } catch (err: any) {
    console.error("[api/profile] PUT error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to update profile" }, { status: 500 });
  }
}
