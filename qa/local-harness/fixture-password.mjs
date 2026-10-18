// b24: harness scripts read the fixture password from FIXTURE_PASSWORD or qa/local-harness/.fixtures-local.md
// written by seed-fixture-accounts.mjs (gitignored). Nothing is printed.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
export function fixturePassword(email) {
  if (process.env.FIXTURE_PASSWORD) return process.env.FIXTURE_PASSWORD;
  const file = resolve(dirname(fileURLToPath(import.meta.url)), ".fixtures-local.md");
  const esc = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`^\\| ${esc} \\| (\\S+) \\|$`, "m").exec(readFileSync(file, "utf8"));
  if (!m) throw new Error(`No fixture password for ${email}; run the seed first.`);
  return m[1];
}
