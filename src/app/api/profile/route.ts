import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { totalumSdk } from "@/lib/totalum";

const schema = z.object({
  name: z.string().min(1, "Name is required").max(120).optional(),
  image: z.string().url().or(z.literal("")).nullable().optional(),
});

// GET /api/profile — current user profile + subscription info
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

// PUT /api/profile — update display name / avatar
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
    if (parsed.data.name !== undefined) patch.name = parsed.data.name;
    if (parsed.data.image !== undefined) patch.image = parsed.data.image || null;

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
