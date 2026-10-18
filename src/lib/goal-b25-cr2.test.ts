import { afterEach, describe, expect, it } from "vitest";
import { resetRateLimits, setDurableCounterStore, takeSlidingRateLimit } from "@/lib/ip-rate-limit";

afterEach(() => { setDurableCounterStore(null); resetRateLimits(); });

describe("b25 CR-2 sliding window", () => {
  it("refuses the 7th POST in 60 s across a minute boundary", async () => {
    const base = 120_000 - 30_000; // 30 s before a clock minute
    for (let i = 0; i < 6; i++) {
      expect((await takeSlidingRateLimit("t", 6, 60_000, base + i * 10_000)).allowed).toBe(true);
    }
    const r = await takeSlidingRateLimit("t", 6, 60_000, base + 59_000);
    expect(r.allowed).toBe(false);
    expect(r.resetSec).toBe(1); // oldest hit (base) leaves at base+60s
  });
  it("lets a hit through once the oldest leaves", async () => {
    for (let i = 0; i < 6; i++) await takeSlidingRateLimit("u", 6, 60_000, i * 1000);
    expect((await takeSlidingRateLimit("u", 6, 60_000, 60_500)).allowed).toBe(true);
  });
  it("decided-by is the table when the durable rows decide", async () => {
    const rows: number[] = [];
    setDurableCounterStore({
      increment: async () => 1,
      slidingHits: async (_k, w, now) => { rows.push(now + w); rows.push(now + w); return rows.filter((e) => e > now); },
    });
    let r = await takeSlidingRateLimit("v", 6, 60_000, 1000);
    for (let i = 1; i < 4; i++) r = await takeSlidingRateLimit("v", 6, 60_000, 1000 + i);
    expect(r.allowed).toBe(false);
    expect(r.backends).toContain("decided-by=durable");
    expect(r.backends).toContain("table=ok");
  });
});
