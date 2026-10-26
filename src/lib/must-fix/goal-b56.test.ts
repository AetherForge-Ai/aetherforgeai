// pull-check:v3-fix-b72-2026-10-27
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("b56 Batch R (M-2): help, docs, status, changelog", () => {
  it("build string", () => {
    expect(read("public/build-version.txt").trim()).toBe("v3-fix-b72-2026-10-27");
  });
});
