// pull-check:v3-b88-2026-10-28
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("b76 CI-TOTALUM: unit tests never call the live Totalum API", () => {
  it("vitest loads the blocker, which points the SDK at a closed local port and drops the key", () => {
    expect(readFileSync("vitest.config.ts", "utf8")).toMatch(/setupFiles: \["\.\/src\/test\/no-live-totalum\.ts"\]/);
    expect(process.env.TOTALUM_API_URL).toBe("http://127.0.0.1:9/");
    expect(process.env.TOTALUM_API_KEY).toBeUndefined();
  });
  it("a fetch to api.totalum.app is refused", async () => {
    await expect(fetch("https://api.totalum.app/api/v1/crud/x")).rejects.toThrow(/blocked live Totalum call/);
  });
});
