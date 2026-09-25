import { describe, expect, it } from "vitest";
import { createSingleFlight } from "@/lib/single-flight";
import { authActionOn401, isBackgroundAuthPoll } from "@/lib/auth-refresh";

describe("session refresh single-flight", () => {
  it("runs the refresh once while callers overlap", async () => {
    let calls = 0;
    const run = createSingleFlight(async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 20));
      return "ok";
    });
    const [a, b, c] = await Promise.all([run(), run(), run()]);
    expect(a).toBe("ok");
    expect(b).toBe("ok");
    expect(c).toBe("ok");
    expect(calls).toBe(1);
  });

  it("keeps a background poll and retries a user action once without rotating", () => {
    expect(isBackgroundAuthPoll("/api/crypto/spot?symbols=SOL")).toBe(true);
    expect(isBackgroundAuthPoll("/api/crypto/markets")).toBe(true);
    expect(isBackgroundAuthPoll("/api/crypto/coin/solana")).toBe(true);
    expect(isBackgroundAuthPoll("/api/stocks/refresh")).toBe(true);
    expect(isBackgroundAuthPoll("/api/transactions")).toBe(false);
    expect(authActionOn401("/api/crypto/spot?symbols=SOL", false)).toBe("keep-session");
    expect(authActionOn401("/api/crypto/markets", true)).toBe("keep-session");
    expect(authActionOn401("/api/stocks/refresh", true)).toBe("keep-session");
    expect(authActionOn401("/api/profile", false)).toBe("retry");
    expect(authActionOn401("/api/transactions", true)).toBe("unauthorized");
  });
});
