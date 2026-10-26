// pull-check:v3-dedupe-b69-2026-10-27
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("b57 Batch 3: H-1, changelog, G-01", () => {
  it("build string", () => {
    expect(read("public/build-version.txt").trim()).toBe("v3-dedupe-b69-2026-10-27");
  });
});
