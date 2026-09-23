import { describe, expect, it } from "vitest";
import { shouldAllowDialogClose } from "./dialog-guards";

describe("shouldAllowDialogClose", () => {
  it("blocks interact-outside / unknown while search is active", () => {
    expect(
      shouldAllowDialogClose({ searchActive: true, queryLength: 0, reason: "interact-outside" })
    ).toBe(false);
    expect(
      shouldAllowDialogClose({ searchActive: true, queryLength: 0, reason: "unknown" })
    ).toBe(false);
    expect(
      shouldAllowDialogClose({ searchActive: true, queryLength: 0, reason: "focus-outside" })
    ).toBe(false);
    expect(
      shouldAllowDialogClose({ searchActive: true, queryLength: 0, reason: "pointer-outside" })
    ).toBe(false);
  });

  it("blocks interact-outside / unknown while queryLength > 0", () => {
    expect(
      shouldAllowDialogClose({ searchActive: false, queryLength: 3, reason: "interact-outside" })
    ).toBe(false);
    expect(
      shouldAllowDialogClose({ searchActive: false, queryLength: 1, reason: "unknown" })
    ).toBe(false);
  });

  it("allows explicit close even while search / typed query is live", () => {
    expect(
      shouldAllowDialogClose({ searchActive: true, queryLength: 5, reason: "explicit" })
    ).toBe(true);
    expect(
      shouldAllowDialogClose({ searchActive: false, queryLength: 0, reason: "explicit" })
    ).toBe(true);
  });

  it("allows escape when search is idle and query is empty", () => {
    expect(
      shouldAllowDialogClose({ searchActive: false, queryLength: 0, reason: "escape" })
    ).toBe(true);
  });

  it("blocks escape while search is active or query is typed (TickerSearch owns Escape)", () => {
    expect(
      shouldAllowDialogClose({ searchActive: true, queryLength: 0, reason: "escape" })
    ).toBe(false);
    expect(
      shouldAllowDialogClose({ searchActive: false, queryLength: 2, reason: "escape" })
    ).toBe(false);
  });

  it("allows non-explicit dismiss when idle", () => {
    expect(
      shouldAllowDialogClose({ searchActive: false, queryLength: 0, reason: "interact-outside" })
    ).toBe(true);
    expect(
      shouldAllowDialogClose({ searchActive: false, queryLength: 0, reason: "unknown" })
    ).toBe(true);
  });
});
