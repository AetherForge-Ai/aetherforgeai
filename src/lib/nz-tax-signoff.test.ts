import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { nzTaxPreviewAllowed, nzTaxPreviewEnabled, nzTaxPreviewSignOff } from "@/lib/feature-flags";
import { runtimeFlagState } from "@/lib/diag-flags";

/** Names that would let a server import flip the K-05/K-06 gate. */
const OVERRIDE_SYMBOLS = [
  "setNzTaxPreviewSignOffForTests",
  "nzTaxPreviewSignOffForTests",
  "signOffForTests",
  "signOffOverride",
];

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, out);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(name) || name.endsWith(".test.ts") || name.endsWith(".test.tsx")) continue;
    out.push(full);
  }
  return out;
}

describe("NZ tax preview sign-off cannot be overridden", () => {
  it("stays off with NODE_ENV unset, development and preview while both flags are 1", () => {
    expect(nzTaxPreviewSignOff()).toBe(false);
    const flags = { NZ_TAX_PREVIEW: "1", TAX_SALE_PREVIEW: "1" };
    expect(nzTaxPreviewEnabled(flags)).toBe(false);
    expect(runtimeFlagState(flags).NZ_TAX_PREVIEW).toBe(false);
    for (const nodeEnv of ["development", "preview", "production", "test"]) {
      const env = { ...flags, NODE_ENV: nodeEnv };
      expect(nzTaxPreviewEnabled(env), nodeEnv).toBe(false);
      expect(runtimeFlagState(env).NZ_TAX_PREVIEW, nodeEnv).toBe(false);
    }
    expect(nzTaxPreviewAllowed(flags, true)).toBe(true);
    expect(nzTaxPreviewAllowed({ NZ_TAX_PREVIEW: " 1", TAX_SALE_PREVIEW: "1" }, true)).toBe(true);
    expect(nzTaxPreviewAllowed({ NZ_TAX_PREVIEW: " 1", TAX_SALE_PREVIEW: "1" }, false)).toBe(false);
  });

  it("nothing in src outside tests can override the sign-off", () => {
    const flags = readFileSync("src/lib/feature-flags.ts", "utf8");
    expect(flags).toContain("export const NZ_TAX_K05_K06_SIGNED_OFF = false");
    expect(flags).toMatch(/export function nzTaxPreviewSignOff\(\): boolean \{\s*return NZ_TAX_K05_K06_SIGNED_OFF;\s*\}/);
    expect(flags).toContain("nzTaxPreviewAllowed(env, nzTaxPreviewSignOff())");
    expect(flags).not.toMatch(/nzTaxPreviewAllowed\([^)]*\btrue\b/);

    for (const file of sourceFiles("src")) {
      const text = readFileSync(file, "utf8");
      for (const symbol of OVERRIDE_SYMBOLS) {
        expect(text, `${file} contains ${symbol}`).not.toContain(symbol);
      }
      if (!file.endsWith(`${path.sep}feature-flags.ts`)) {
        expect(text, file).not.toContain("nzTaxPreviewAllowed(");
        expect(text, file).not.toMatch(/NZ_TAX_K05_K06_SIGNED_OFF\s*=/);
      }
    }
  });
});
