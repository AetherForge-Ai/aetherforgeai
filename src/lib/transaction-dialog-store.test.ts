import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetTxDialogStoreForTests,
  getTxDialogSnapshot,
  notePortfolioSoftRefresh,
  publishTxDialog,
} from "./transaction-dialog-store";

describe("transaction dialog survives portfolio soft-refresh", () => {
  beforeEach(() => {
    __resetTxDialogStoreForTests();
  });

  it("does not remount or dismiss when holdings/cash refresh while Buy/Add is open", () => {
    publishTxDialog({
      open: true,
      userId: "user-tt",
      mode: "buy",
      holdings: [{ _id: "h1", ticker: "CBA.AX" }],
      cash: 15.26,
      preferredAssetType: "stock",
    });
    const opened = getTxDialogSnapshot();
    expect(opened.open).toBe(true);

    const after = notePortfolioSoftRefresh({
      holdings: [
        { _id: "h1", ticker: "CBA.AX" },
        { _id: "h2", ticker: "BHP.AX" },
      ],
      cash: 999,
    });

    const snap = getTxDialogSnapshot();
    expect(after.remounted).toBe(false);
    expect(after.dismissed).toBe(false);
    expect(after.applied).toBe(false);
    expect(after.mountId).toBe(opened.mountId);
    expect(snap.mountId).toBe(opened.mountId);
    expect(snap.open).toBe(true);
    expect(snap.cash).toBe(15.26);
    expect(snap.holdings).toEqual([{ _id: "h1", ticker: "CBA.AX" }]);
    expect(snap.mode).toBe("buy");
  });

  it("ignores a parent republish of open:true with fresh holdings (remount race)", () => {
    publishTxDialog({
      open: true,
      userId: "user-tt",
      mode: "buy",
      holdings: [{ ticker: "BAP.AX" }],
      cash: 15.26,
    });
    const mountId = getTxDialogSnapshot().mountId;
    const again = publishTxDialog({
      open: true,
      userId: "user-tt",
      mode: "buy",
      holdings: [{ ticker: "OTHER" }],
      cash: 0,
    });
    expect(again.ignoredSoftRefresh).toBe(true);
    expect(getTxDialogSnapshot().mountId).toBe(mountId);
    expect(getTxDialogSnapshot().open).toBe(true);
    expect(getTxDialogSnapshot().holdings).toEqual([{ ticker: "BAP.AX" }]);
    expect(getTxDialogSnapshot().cash).toBe(15.26);
  });

  it("a Buy/Sell mode change while open does not remount", () => {
    publishTxDialog({
      open: true,
      userId: "user-tt",
      mode: "buy",
      holdings: [{ ticker: "BAP.AX" }],
      cash: 15.26,
    });
    const mountId = getTxDialogSnapshot().mountId;
    publishTxDialog({ open: true, mode: "sell", holdings: [], cash: 0 });
    expect(getTxDialogSnapshot().mode).toBe("sell");
    expect(getTxDialogSnapshot().mountId).toBe(mountId);
    expect(getTxDialogSnapshot().open).toBe(true);
    expect(getTxDialogSnapshot().cash).toBe(15.26);
    expect(getTxDialogSnapshot().holdings).toEqual([{ ticker: "BAP.AX" }]);
  });

  it("explicit close clears open without looking like a soft-refresh remount", () => {
    publishTxDialog({ open: true, userId: "user-tt", mode: "buy", cash: 15.26, holdings: [] });
    const mountId = getTxDialogSnapshot().mountId;
    publishTxDialog({ open: false });
    expect(getTxDialogSnapshot().open).toBe(false);
    expect(getTxDialogSnapshot().mountId).toBe(mountId);
  });

  it("account switch closes the dialog and bumps mount id", () => {
    publishTxDialog({ open: true, userId: "user-tt", mode: "buy", cash: 15.26, holdings: [{ ticker: "BAP.AX" }] });
    const mountId = getTxDialogSnapshot().mountId;
    publishTxDialog({ open: false, userId: "user-1t" });
    // userId on a close publish while open is a switch (publishTxDialog treats
    // userSwitch before the close flag when both are set).
    const snap = getTxDialogSnapshot();
    expect(snap.open).toBe(false);
    expect(snap.mountId).not.toBe(mountId);
    expect(snap.userId).toBe("user-1t");
    expect(snap.cash).toBe(0);
  });
});
