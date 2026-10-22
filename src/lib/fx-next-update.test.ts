import { afterEach, describe, expect, it, vi } from "vitest";

const DAY1 = 1_792_540_951; // 21 Oct 2026 00:02:31 UTC
const DAY2 = DAY1 + 86_400;

function payload(last: number, next: number) {
  return { result: "success", rates: { AUD: 0.9, USD: 0.57 }, time_last_update_unix: last, time_next_update_unix: next };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("FX P2: daily rate picked up after the provider's next update", () => {
  it("fxCacheFresh honours the hourly TTL and the provider's next update time", async () => {
    const { fxCacheFresh, FX_NEXT_UPDATE_GRACE_MS } = await import("@/lib/fx");
    const t0 = 1_000_000_000_000;
    expect(fxCacheFresh(null, t0)).toBe(false);
    expect(fxCacheFresh({ fetchedAtMs: t0 }, t0 + 59 * 60_000)).toBe(true);
    expect(fxCacheFresh({ fetchedAtMs: t0 }, t0 + 60 * 60_000)).toBe(false);
    const next = t0 + 10 * 60_000;
    expect(fxCacheFresh({ fetchedAtMs: t0, nextUpdateMs: next }, next + FX_NEXT_UPDATE_GRACE_MS - 1)).toBe(true);
    expect(fxCacheFresh({ fetchedAtMs: t0, nextUpdateMs: next }, next + FX_NEXT_UPDATE_GRACE_MS)).toBe(false);
  });

  it("refetches without the platform cache once the next update is due", async () => {
    const calls: Array<RequestInit | undefined> = [];
    let body = payload(DAY1, DAY2);
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      calls.push(init);
      return new Response(JSON.stringify(body), { status: 200 });
    }));
    const { getFxSnapshot } = await import("@/lib/fx");
    const before = DAY2 * 1000 - 20 * 60_000;
    const first = await getFxSnapshot(before);
    expect(first.asOf).toBe(new Date(DAY1 * 1000).toISOString());
    expect((calls[0] as { cache?: string }).cache).toBeUndefined();

    body = payload(DAY2, DAY2 + 86_400);
    const after = DAY2 * 1000 + 6 * 60_000; // inside the old one-hour TTL
    const second = await getFxSnapshot(after);
    expect(calls).toHaveLength(2);
    expect((calls[1] as { cache?: string }).cache).toBe("no-store");
    expect(second.asOf).toBe(new Date(DAY2 * 1000).toISOString());
    expect(second.sourced).toBe(true);
  });

  it("keeps the hourly cache when the provider sends no next update time", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ...payload(DAY1, 0), time_next_update_unix: undefined }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { getFxSnapshot } = await import("@/lib/fx");
    const t = DAY1 * 1000;
    await getFxSnapshot(t);
    await getFxSnapshot(t + 30 * 60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("b58 P3: crypto notice zone and sources", () => {
  it("credits CoinGecko and CoinPaprika in the list notice", async () => {
    const { snapshotFeedLabel } = await import("@/lib/crypto-keyless-seed");
    expect(snapshotFeedLabel(["coinpaprika", "coingecko", "coingecko"])).toBe("Sources: CoinGecko, CoinPaprika.");
    expect(snapshotFeedLabel(["coingecko"])).toBe("Source: CoinGecko.");
  });

  it("labels the time NZDT in summer and NZST in winter", async () => {
    const { savedSnapshotLabel } = await import("@/lib/status-feeds");
    expect(savedSnapshotLabel("2026-10-22T00:46:00Z", Date.parse("2026-10-22T01:00:00Z"))).toBe("Prices last updated 1:46 pm NZDT");
    expect(savedSnapshotLabel("2026-07-01T00:46:00Z", Date.parse("2026-07-01T01:00:00Z"))).toBe("Prices last updated 12:46 pm NZST");
  });
});
