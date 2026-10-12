#!/usr/bin/env node
/**
 * FIFO recompute dry-run.
 * Does not connect to a database. Does not write production rows.
 * --apply is refused until Lukas confirms the cost method and asks for the write.
 *
 * Prints qa/T1-fifo-recompute-dry-run.txt (the sample book, not a live ledger).
 */
const fs = require("fs");
const path = require("path");

if (process.argv.includes("--apply")) {
  console.error("Refused. Lukas must confirm FIFO before any recompute. This script does not write.");
  process.exit(1);
}

const file = path.join(__dirname, "../qa/T1-fifo-recompute-dry-run.txt");
process.stdout.write(fs.readFileSync(file, "utf8"));
