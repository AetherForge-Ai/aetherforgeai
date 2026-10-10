import { describe, expect, it } from "vitest";
import {
  __resetBookCacheForTests,
  bookCacheEpoch,
  invalidateBookCache,
  readBookCache,
  writeBookCache,
} from "./book-cache";

describe("book cache epoch", () => {
  it("drops a write that started before the trade", () => {
    __resetBookCacheForTests();
    const epoch = bookCacheEpoch("user-1");
    invalidateBookCache("user-1");
    expect(writeBookCache("user-1:stocks:all", [{ ticker: "AAPL", shares: 1 }], epoch)).toBe(false);
    expect(readBookCache("user-1:stocks:all")).toBeNull();
    const fresh = bookCacheEpoch("user-1");
    expect(writeBookCache("user-1:stocks:all", [{ ticker: "AAPL", shares: 2 }], fresh)).toBe(true);
    expect(readBookCache<[{ shares: number }]>("user-1:stocks:all")?.[0].shares).toBe(2);
  });
});
