import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetClientUserStateForTests,
  bindClientUser,
  cashBalanceStorageKey,
  clearClientUserState,
  purgeLegacyCashCache,
  readCachedCashNZD,
  writeCachedCashNZD,
} from "./client-user-state";
import {
  __resetTransactionStickyForTests,
  getStickyTxOpen,
  setStickyTxOpen,
  bindTransactionStickyUser,
} from "./transaction-sticky";

function installMemorySessionStorage() {
  const store = new Map<string, string>();
  const memory = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
  };
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: memory,
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: globalThis,
  });
}

describe("client-user-state cash cache", () => {
  beforeEach(() => {
    installMemorySessionStorage();
    __resetClientUserStateForTests();
    __resetTransactionStickyForTests();
    sessionStorage.clear();
  });

  it("scopes cash by userId and ignores legacy unscoped key", () => {
    sessionStorage.setItem("af.cashBalanceNZD", "15.26"); // TT legacy poison
    expect(readCachedCashNZD("user-1t")).toBeNull();
    expect(sessionStorage.getItem("af.cashBalanceNZD")).toBeNull(); // purged

    writeCachedCashNZD("user-1t", 2382);
    expect(readCachedCashNZD("user-1t")).toBe(2382);
    expect(readCachedCashNZD("user-tt")).toBeNull();
    expect(sessionStorage.getItem(cashBalanceStorageKey("user-1t"))).toBe("2382");
  });

  it("clears sticky Buy/Add when binding a different user", () => {
    bindTransactionStickyUser("user-tt");
    setStickyTxOpen(true);
    expect(getStickyTxOpen()).toBe(true);

    bindClientUser("user-tt");
    expect(getStickyTxOpen()).toBe(true); // same user keeps sticky

    bindClientUser("user-1t");
    expect(getStickyTxOpen()).toBe(false); // switched — must not reopen TT modal
  });

  it("clearClientUserState wipes cash keys and sticky", () => {
    writeCachedCashNZD("user-1t", 100);
    setStickyTxOpen(true);
    clearClientUserState();
    expect(readCachedCashNZD("user-1t")).toBeNull();
    expect(getStickyTxOpen()).toBe(false);
  });

  it("purgeLegacyCashCache is idempotent", () => {
    sessionStorage.setItem("af.cashBalanceNZD", "1");
    purgeLegacyCashCache();
    purgeLegacyCashCache();
    expect(sessionStorage.getItem("af.cashBalanceNZD")).toBeNull();
  });
});
