// pull-check:v3-b90-2026-10-29
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("b58 H-9 split cash, FX P2, P3 crypto notice", () => {
  it("build string", () => {
    expect(read("public/build-version.txt").trim()).toBe("v3-b92-2026-10-31");
  });
});
