/**
 * New Totalum tables approved by Lukas, 20 Oct 2026 15:52 NZDT (K-01). Definitions only: the tables are
 * NOT created by this code. Manager/Executor create them in Totalum per the build loop, then turn the
 * matching feature flag on. Every table is additive (no change to an existing table).
 *
 * Totalum notes (totalum-docs/totalum-database): snake_case; _id, createdAt, updatedAt are automatic;
 * no boolean type (use options yes/no); datetimes use includeHour; relations use objectReference.
 * Totalum has no documented unique/compound index, so "unique" below is enforced in code (query
 * before create, idempotent by key) and listed so it can be added if Totalum supports it (UNKNOWN).
 */

export type TotalumFieldType = "string" | "number" | "date" | "long-string" | "options" | "objectReference";

export interface FieldSpec {
  name: string;
  type: TotalumFieldType;
  required?: boolean;
  options?: readonly string[];
  /** objectReference: target table and relation, e.g. user manyToOne. */
  ref?: { table: string; relation: "manyToOne" };
  includeHour?: boolean;
  note?: string;
}

export interface TableSpec {
  ticket: string;
  table: string;
  purpose: string;
  fields: readonly FieldSpec[];
  /** Lookups the code makes; "unique" ones are enforced in code. */
  indexes: readonly { fields: readonly string[]; unique?: boolean }[];
  access: string;
  flag: string;
  rollback: readonly string[];
}

export function flagOn(name: string, env: Record<string, string | undefined> = process.env): boolean {
  return String(env[name] || "").trim().toLowerCase() === "on";
}
