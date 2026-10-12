#!/usr/bin/env node
/**
 * DateTime_NZ backfill dry-run.
 * Does not connect to a database. Does not write production rows.
 * --apply is refused until Lukas approves the backfill.
 *
 * Prints qa/T5-datetime-backfill-dry-run.txt.
 */
const fs = require("fs");
const path = require("path");

if (process.argv.includes("--apply")) {
  console.error("Refused. Lukas must approve the DateTime_NZ backfill before it runs. This script does not write.");
  process.exit(1);
}

const file = path.join(__dirname, "../qa/T5-datetime-backfill-dry-run.txt");
process.stdout.write(fs.readFileSync(file, "utf8"));
