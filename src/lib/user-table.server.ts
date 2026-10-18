import { NextResponse } from "next/server";
import { classifyTableError } from "@/lib/ip-rate-limit";

/** Goal b22: rows from per-user tables always belong to the caller. */
export function ownerOf(row: Record<string, unknown>): string {
  const u = row.user as string | { _id?: string } | undefined;
  return String(typeof u === "object" && u ? u._id ?? "" : u ?? "");
}

/** A table read/write failure, answered with a safe code. "missing" tells the client to keep its local copy. */
export function tableFailure(table: string, err: unknown): NextResponse {
  const code = classifyTableError(err);
  console.error(`[api/${table}] table error ${code}`);
  return NextResponse.json(
    { ok: false, error: code === "missing" ? `The ${table} table is not set up yet.` : "Could not reach saved data. Nothing was changed.", code: code === "missing" ? "table_missing" : "table_error" },
    { status: 503 }
  );
}

export const money = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};
