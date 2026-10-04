#!/usr/bin/env ts-node
/**
 * Retired.
 *
 * This script used to create a new Starter / Pro / Ultimate product at the
 * previous public amounts (NZ$29 / NZ$69 / NZ$199). Do not run it. Prices are
 * immutable, and a second product at the old amounts must not be created.
 *
 * The Oct 2026 Starter and Pro prices are created on the existing products by
 * scripts/reprice-public-tiers.ts. Ultimate stays enquiry-only.
 */

console.error(
  "Retired. This script created the NZ$29 / NZ$69 / NZ$199 catalog. Use scripts/reprice-public-tiers.ts. Existing prices were not changed."
);
process.exit(1);
