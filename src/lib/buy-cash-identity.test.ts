import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetAccountIdentityForTests,
  acceptAccountPayload,
  bindActiveAccount,
  getActiveAccountUserId,
  trackAccountRequest,
} from "./account-identity";
import { buyCashUiFromResponse, buyReviewAllowed, planBuyCashFetch } from "./buy-cash-identity";

const LOGGED_IN = "6abafe532607b46efbd28da1";

describe("buy cash identity sequencing", () => {
  beforeEach(() => {
    __resetAccountIdentityForTests();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: globalThis,
    });
  });

  it("binds the logged-in user before the cash request when the shell has no account", () => {
    expect(getActiveAccountUserId()).toBeNull();
    const plan = planBuyCashFetch(null, LOGGED_IN);
    expect(plan).toEqual({ action: "fetch", userId: LOGGED_IN, bind: true });
    if (plan.action !== "fetch") return;
    if (plan.bind) bindActiveAccount(plan.userId);

    const tracked = trackAccountRequest();
    expect(tracked.userId).toBe(LOGGED_IN);
    const accepted = acceptAccountPayload({
      epoch: tracked.epoch,
      requestUserId: tracked.userId,
      responseUserId: LOGGED_IN,
    });
    expect(accepted).toBe(true);

    const ui = buyCashUiFromResponse({
      accepted,
      ok: true,
      cashBalance: 11047.68,
    });
    expect(ui).toEqual({ loading: false, balance: 11047.68, error: null });
    expect(buyReviewAllowed(ui)).toBe(true);
  });

  it("keeps a dashboard-bound account when the session probe has not returned yet", () => {
    bindActiveAccount("user-1t");
    expect(planBuyCashFetch("user-1t", null)).toEqual({
      action: "fetch",
      userId: "user-1t",
      bind: false,
    });
  });

  it("refuses a live session that is not the account on screen", () => {
    const plan = planBuyCashFetch("user-1t", "user-tt");
    expect(plan.action).toBe("refuse");
    if (plan.action !== "refuse") return;
    expect(buyReviewAllowed({ loading: false, balance: null, error: plan.error })).toBe(false);
  });

  it("does not enable review when the cash body is discarded or still loading", () => {
    const discarded = buyCashUiFromResponse({
      accepted: false,
      ok: true,
      cashBalance: 11047.68,
    });
    expect(discarded.loading).toBe(false);
    expect(discarded.balance).toBeNull();
    expect(discarded.error).toBeTruthy();
    expect(buyReviewAllowed(discarded)).toBe(false);
    expect(buyReviewAllowed({ loading: true, balance: 11047.68, error: null })).toBe(false);
    expect(buyReviewAllowed({ loading: false, balance: 0, error: null })).toBe(true);
  });

  it("still discards a prior-account response after the active user changes", () => {
    bindActiveAccount("user-tt");
    const stale = trackAccountRequest();
    bindActiveAccount("user-1t");
    expect(
      acceptAccountPayload({
        epoch: stale.epoch,
        requestUserId: stale.userId,
        responseUserId: "user-tt",
      })
    ).toBe(false);
    const ui = buyCashUiFromResponse({ accepted: false, ok: true, cashBalance: 15.26 });
    expect(ui.balance).toBeNull();
    expect(buyReviewAllowed(ui)).toBe(false);
  });

  it("clears loading on an unauthorized or failed cash read", () => {
    expect(
      buyCashUiFromResponse({ accepted: true, ok: false, status: 401, cashBalance: null })
    ).toEqual({
      loading: false,
      balance: null,
      error: "Sign in to load available cash.",
    });
    expect(
      buyCashUiFromResponse({
        accepted: true,
        ok: false,
        status: 500,
        error: "Failed to load transactions",
      })
    ).toEqual({
      loading: false,
      balance: null,
      error: "Failed to load transactions",
    });
  });
});
