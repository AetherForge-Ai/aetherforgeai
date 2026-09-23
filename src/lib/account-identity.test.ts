import { beforeEach, describe, expect, it } from "vitest";
import { hasForeignOwner, requestClaimsOtherUser, userRecordConflicts } from "./account-guard";
import {
  __resetAccountIdentityForTests,
  acceptAccountPayload,
  bindActiveAccount,
  getAccountEpoch,
  shouldApplyAccountResponse,
  trackAccountRequest,
} from "./account-identity";

describe("account identity apply-gate", () => {
  beforeEach(() => {
    __resetAccountIdentityForTests();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: globalThis,
    });
  });

  it("discards a response whose userId is not the active account", () => {
    bindActiveAccount("user-1t");
    const tracked = trackAccountRequest();
    expect(
      shouldApplyAccountResponse({
        epoch: tracked.epoch,
        requestUserId: tracked.userId,
        responseUserId: "user-tt",
      })
    ).toBe(false);
    expect(
      acceptAccountPayload({
        epoch: tracked.epoch,
        requestUserId: tracked.userId,
        responseUserId: "user-tt",
        rows: [{ user: "user-tt", cashBalance: 15.26 }],
      })
    ).toBe(false);
  });

  it("discards a response that omits userId (stale cached body)", () => {
    bindActiveAccount("user-1t");
    const tracked = trackAccountRequest();
    expect(
      shouldApplyAccountResponse({
        epoch: tracked.epoch,
        requestUserId: tracked.userId,
        responseUserId: undefined,
      })
    ).toBe(false);
    expect(
      shouldApplyAccountResponse({
        epoch: tracked.epoch,
        requestUserId: tracked.userId,
        responseUserId: null,
      })
    ).toBe(false);
  });

  it("discards an in-flight prior-account response after the active user changes", () => {
    bindActiveAccount("user-tt");
    const stale = trackAccountRequest();
    expect(stale.signal.aborted).toBe(false);

    bindActiveAccount("user-1t");
    expect(stale.signal.aborted).toBe(true);
    expect(getAccountEpoch()).toBeGreaterThan(stale.epoch);
    // The stale closure's expected id still matches its own TT body — that is
    // exactly the bug. Apply time must compare against the active 1T account.
    expect(
      shouldApplyAccountResponse({
        epoch: stale.epoch,
        requestUserId: "user-tt",
        responseUserId: "user-tt",
      })
    ).toBe(false);
    expect(
      acceptAccountPayload({
        epoch: stale.epoch,
        requestUserId: "user-tt",
        responseUserId: "user-tt",
      })
    ).toBe(false);
  });

  it("applies a response only when the echo matches the active user and rows agree", () => {
    bindActiveAccount("user-1t");
    const tracked = trackAccountRequest();
    expect(
      acceptAccountPayload({
        epoch: tracked.epoch,
        requestUserId: tracked.userId,
        responseUserId: "user-1t",
        rows: [{ user: "user-1t" }, { user: "user-1t" }],
      })
    ).toBe(true);
  });

  it("discards a body stamped with the active user that still contains another user's rows", () => {
    bindActiveAccount("user-1t");
    const tracked = trackAccountRequest();
    expect(
      acceptAccountPayload({
        epoch: tracked.epoch,
        requestUserId: tracked.userId,
        responseUserId: "user-1t",
        rows: [{ user: "user-1t" }, { user: "user-tt" }],
      })
    ).toBe(false);
  });

  it("does not bump epoch when rebinding the same user", () => {
    bindActiveAccount("user-1t");
    const epoch = getAccountEpoch();
    const tracked = trackAccountRequest();
    bindActiveAccount("user-1t");
    expect(getAccountEpoch()).toBe(epoch);
    expect(tracked.signal.aborted).toBe(false);
  });
});

describe("account guard helpers", () => {
  it("detects a foreign user record and a mismatched client claim", () => {
    expect(userRecordConflicts("user-1t", { _id: "user-tt", cash_balance: 15.26 })).toBe(true);
    expect(userRecordConflicts("user-1t", { _id: "user-1t", cash_balance: 2382.55 })).toBe(false);
    expect(userRecordConflicts("user-1t", null)).toBe(false);
    expect(hasForeignOwner([{ user: "user-tt" }], "user-1t")).toBe(true);
    expect(hasForeignOwner([{ user: "user-1t" }], "user-1t")).toBe(false);
    const req = { headers: { get: (n: string) => (n === "x-af-user-id" ? "user-1t" : null) } };
    expect(requestClaimsOtherUser(req, "user-tt")).toBe(true);
    expect(requestClaimsOtherUser(req, "user-1t")).toBe(false);
  });
});
