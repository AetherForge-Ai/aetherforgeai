import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetDialogGuardsForTests,
  guardDialogOpenChange,
  noteDialogSearchQuery,
  shouldAllowDialogClose,
} from "./dialog-guards";

describe("shouldAllowDialogClose", () => {
  beforeEach(() => {
    __resetDialogGuardsForTests();
  });
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

  it("stocks Buy/Add search-settle close is blocked when React query state was wiped", () => {
    // /dashboard/stocks remounts TickerSearch as Yahoo settles, so the dialog's
    // searchQuery prop is 0 even though the user typed BAP. The module query
    // must still keep Buy/Add open. Explicit Cancel still closes.
    noteDialogSearchQuery("BAP");
    let closed = false;
    guardDialogOpenChange(false, () => {
      closed = true;
    }, { reason: "unknown", queryLength: 0 });
    expect(closed).toBe(false);
    guardDialogOpenChange(false, () => {
      closed = true;
    }, { reason: "explicit", queryLength: 0 });
    expect(closed).toBe(true);
  });
});
