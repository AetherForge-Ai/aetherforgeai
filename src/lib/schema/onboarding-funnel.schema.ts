import type { TableSpec } from "./types";

export const ONBOARDING_FUNNEL_EVENT: TableSpec = {
  ticket: "G-28",
  table: "onboarding_funnel_event",
  purpose: "Server-side onboarding funnel (replaces the localStorage-only count, kept as fallback).",
  fields: [
    { name: "user", type: "objectReference", ref: { table: "user", relation: "manyToOne" }, note: "AC user_id; empty when signed out" },
    { name: "anon_id", type: "string", note: "crypto random id from a first-party cookie set only after consent" },
    { name: "event", type: "options", required: true, options: ["view", "quiz_start", "quiz_result", "checklist_step", "signup"] },
    { name: "step_key", type: "string" },
    { name: "plan_result", type: "string" },
  ],
  indexes: [{ fields: ["event", "createdAt"] }, { fields: ["user", "createdAt"] }, { fields: ["anon_id", "createdAt"] }],
  access: "Write-only via one server route (validated, rate limited); no client reads; aggregates in an admin view. No IP stored.",
  flag: "ONBOARDING_FUNNEL_SERVER=on",
  rollback: ["Set ONBOARDING_FUNNEL_SERVER off (route answers 204 and writes nothing; localStorage count still works).", "Then delete onboarding_funnel_event in Totalum."],
};

