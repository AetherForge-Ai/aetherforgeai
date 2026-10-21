import type { TableSpec } from "./types";

export const LEDGER_TOMBSTONE: TableSpec = {
  ticket: "G-10",
  table: "ledger_tombstone",
  purpose: "A deleted ledger row's key, so a late replay, sync or reload can never bring it back.",
  fields: [
    { name: "user", type: "objectReference", required: true, ref: { table: "user", relation: "manyToOne" }, note: "AC user_id" },
    { name: "portfolio_id", type: "string", note: "Book/portfolio id when the app has one; blank = the user's main book" },
    { name: "entity_type", type: "options", required: true, options: ["trade", "dividend", "cash"] },
    { name: "entity_id", type: "string", required: true, note: "transaction _id (a Totalum id, not a relation: the row is gone)" },
    { name: "op", type: "options", required: true, options: ["delete", "replace"] },
    { name: "client_op_id", type: "string", required: true, note: "idempotency key from the client (uuid/idem key)" },
    { name: "expires_at", type: "date", includeHour: true, note: "optional purge after 30 days" },
  ],
  indexes: [{ fields: ["user", "client_op_id"], unique: true }, { fields: ["user", "portfolio_id", "entity_id"] }, { fields: ["expires_at"] }],
  access: "Owner only. Every read/write filtered by the signed-in user on the server. Never exposed to G-27 invitees.",
  flag: "LEDGER_TOMBSTONE_TABLE=on",
  rollback: ["Set LEDGER_TOMBSTONE_TABLE off (code falls back to the b39 memory + edge-cache tombstone).", "Then delete the ledger_tombstone table in Totalum."],
};

