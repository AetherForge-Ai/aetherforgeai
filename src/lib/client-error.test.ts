import { describe, expect, it } from "vitest";
import { clientErrorSummary, shouldIgnoreClientError } from "@/lib/client-error";

describe("client error filter", () => {
  it("ignores image load failures and empty undefined throws", () => {
    expect(shouldIgnoreClientError({ target: { tagName: "IMG" }, message: "fail", error: new Error("img") })).toBe(true);
    expect(shouldIgnoreClientError({ message: undefined, error: undefined })).toBe(true);
    expect(shouldIgnoreClientError({ message: "undefined" })).toBe(true);
    expect(shouldIgnoreClientError({ message: "" })).toBe(true);
    expect(shouldIgnoreClientError({ message: "Script error." })).toBe(true);
  });

  it("keeps a real script exception", () => {
    const error = new Error("Cannot read properties of undefined");
    expect(shouldIgnoreClientError({ error, message: error.message })).toBe(false);
    expect(clientErrorSummary({ error, message: error.message })).toBe("Cannot read properties of undefined");
  });
});
