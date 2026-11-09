import type { TableSpec } from "./types";

/**
 * BS-01 broker_connection. The live table is not created or altered by this file.
 * Columns already used by connection-store.server.ts. Every field is nullable in this spec
 * so a later Totalum edit can only add, never narrow or drop.
 * BROKER_TOKEN_KEY is the existing env name (32-byte base64). This change does not set it.
 */
export const BROKER_CONNECTION: TableSpec = {
  ticket: "BS-01",
  table: "broker_connection",
  purpose: "One encrypted IBKR Flex token and Query ID per member. Ciphertext only; the token is never returned or logged.",
  fields: [
    { name: "user", type: "objectReference", ref: { table: "user", relation: "manyToOne" }, note: "Signed-in member. Nullable in this spec." },
    { name: "broker", type: "string", note: "ibkr. Nullable in this spec." },
    { name: "enc_token", type: "long-string", note: "AES-GCM ciphertext v1.iv.ct from BROKER_TOKEN_KEY. Never a raw token." },
    { name: "query_id", type: "string", note: "Flex Query ID. Not the token." },
    { name: "last_sync", type: "date", includeHour: true, note: "Nullable." },
    { name: "status", type: "string", note: "active, error, or expired. Nullable." },
    { name: "last_error", type: "string", note: "Plain message. Never the token. Nullable." },
  ],
  indexes: [{ fields: ["user", "broker"], unique: true }],
  access: "Server only. publicConnection omits enc_token.",
  flag: "BROKER_TOKEN_KEY unset means connect and sync fail closed and save nothing. Do not set the key in this change.",
  rollback: [
    "Do not drop broker_connection or any column.",
    "Stop calling /api/cron/broker-sync. Leave stored ciphertext in place.",
    "Leave BROKER_TOKEN_KEY unset so connect and sync fail closed and save nothing.",
  ],
};
