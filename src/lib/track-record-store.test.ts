import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/totalum", () => ({ totalumSdk: { crud: {} } }));

import { extractCalls, verifyScorecard, weeklyScorecard } from "@/lib/track-record";
import {
  isTrackScorecardTicker,
  packScorecard,
  snapshotFromRun,
  trackScorecardChunkTicker,
  TRACK_SCORECARD_TICKER,
  unpackScorecard,
  viewFromStoredJson,
  type TrackRunSnapshot,
} from "@/lib/track-record-store";
import { loadTrackRecordView, persistTrackRun, type ScorecardRows } from "@/lib/track-record-store.server";

const read = (p: string) => readFileSync(p, "utf8");

function memoryRows(): { map: Map<string, string>; rows: ScorecardRows } {
  const map = new Map<string, string>();
  return {
    map,
    rows: {
      read: async (ticker) => (map.has(ticker) ? map.get(ticker)! : null),
      write: async (ticker, body) => {
        map.set(ticker, body);
      },
      delete: async (ticker) => {
        map.delete(ticker);
      },
    },
  };
}

async function collectedRun(): Promise<TrackRunSnapshot> {
  const calls = await extractCalls({
    _id: "r1",
    bot: "stox",
    generated_at: "2026-10-01T20:00:00.000Z",
    payload: JSON.stringify({
      tickers: [
        { ticker: "SECRET.NZ", price: 28, signal: "Buy" },
        { ticker: "AIR.NZ", price: 0.6, signal: "Sell" },
        { ticker: "SPK.NZ", price: 3, signal: "Hold" },
      ],
    }),
  });
  const card = await weeklyScorecard("2026-10-18", calls, { [calls[0].hash]: 27 });
  return {
    reportsRead: 4,
    laterPrices: { fetched: 1, reused: 2 },
    verified: calls.map(() => ({ ok: true })),
    card,
  };
}

describe("G-20 stored scorecard", () => {
  it("keeps a miss in the stored card, recomputes the hash, and hides tickers from the view", async () => {
    const run = await collectedRun();
    expect(run.card.misses).toBe(1);
    expect(run.card.pending).toBe(1);
    expect(run.card.unscored).toBe(1);
    expect(run.card.hits).toBe(0);
    expect(run.card.calls.some((c) => c.result === "miss" && c.ticker === "SECRET.NZ")).toBe(true);
    expect(await verifyScorecard(run.card)).toBe(true);

    const { map, rows } = memoryRows();
    const stored = await persistTrackRun(run, rows, "2026-10-18T01:00:00.000Z");
    expect(stored).toEqual({ ok: true });
    const storedRaw = map.get(TRACK_SCORECARD_TICKER) || "";
    expect(unpackScorecard(storedRaw, [])).toContain("SECRET.NZ");

    const loaded = await loadTrackRecordView(rows);
    expect(loaded.kind).toBe("ready");
    if (loaded.kind !== "ready") return;
    expect(loaded.view).toMatchObject({
      week: "2026-10-18",
      reportsRead: 4,
      calls: 3,
      hits: 0,
      misses: 1,
      pending: 1,
      unscored: 1,
      laterFetched: 1,
      laterReused: 2,
      verifiedOk: 3,
      verifiedTotal: 3,
      hashMatches: true,
      totalsAddUp: true,
      scorecardHash: run.card.scorecardHash,
    });
    const shown = JSON.stringify(loaded.view);
    expect(shown).not.toContain("SECRET.NZ");
    expect(shown).not.toContain("AIR.NZ");
    expect(shown).not.toContain("SPK.NZ");
    expect(shown).not.toContain("Buy");
    expect(shown).not.toContain("Sell");
    expect(Object.keys(loaded.view)).not.toContain("ticker");
  });

  it("shows collected counts when nothing is scored yet, and shows nothing when no card is stored", async () => {
    const calls = await extractCalls({
      _id: "r2",
      bot: "stox",
      generated_at: "2026-10-16T20:00:00.000Z",
      payload: JSON.stringify({ tickers: [{ ticker: "FPH.NZ", price: 10, signal: "Buy" }] }),
    });
    const card = await weeklyScorecard("2026-10-18", calls, {});
    expect(card).toMatchObject({ hits: 0, misses: 0, pending: 1, unscored: 0 });
    const { rows } = memoryRows();
    await persistTrackRun({ reportsRead: 1, laterPrices: { fetched: 0, reused: 0 }, verified: [{ ok: true }], card }, rows, "2026-10-18T02:00:00.000Z");
    const loaded = await loadTrackRecordView(rows);
    expect(loaded.kind).toBe("ready");
    if (loaded.kind !== "ready") return;
    expect(loaded.view.hits).toBe(0);
    expect(loaded.view.misses).toBe(0);
    expect(loaded.view.pending).toBe(1);
    expect(loaded.view.hashMatches).toBe(true);

    const empty = await loadTrackRecordView(memoryRows().rows);
    expect(empty).toEqual({ kind: "missing" });
  });

  it("refuses to store a card whose hash does not match, and a tampered body fails the verifier", async () => {
    const run = await collectedRun();
    const { map, rows } = memoryRows();
    const bad = await persistTrackRun({ ...run, card: { ...run.card, misses: 0 } }, rows);
    expect(bad.ok).toBe(false);
    expect(map.size).toBe(0);

    const snap = snapshotFromRun(run, "2026-10-18T01:00:00.000Z");
    const tampered = { ...snap, card: { ...snap.card, hits: 9 } };
    const view = await viewFromStoredJson(JSON.stringify(tampered));
    expect(view?.hits).toBe(9);
    expect(view?.hashMatches).toBe(false);
    expect(JSON.stringify(view)).not.toContain("SECRET.NZ");
  });

  it("round-trips a chunked card and deletes leftover chunks that could hold old tickers", async () => {
    const run = await collectedRun();
    const json = JSON.stringify(snapshotFromRun(run, "2026-10-18T01:00:00.000Z"));
    const packed = packScorecard(json, 80, 60);
    expect(packed).not.toBeNull();
    expect(packed!.chunks.length).toBeGreaterThan(1);
    expect(unpackScorecard(packed!.header, packed!.chunks)).toBe(json);

    const noise = randomBytes(200).toString("base64");
    const wide = packScorecard(JSON.stringify({ noise }), 40, 30);
    expect(wide!.chunks.length).toBeGreaterThan(1);
    expect(unpackScorecard(wide!.header, wide!.chunks)).toBe(JSON.stringify({ noise }));

    const { map, rows } = memoryRows();
    map.set(TRACK_SCORECARD_TICKER, JSON.stringify({ v: 1, parts: 2 }));
    map.set(trackScorecardChunkTicker(1), "old-SECRET.NZ");
    map.set(trackScorecardChunkTicker(2), "old-AIR.NZ");
    expect((await persistTrackRun(run, rows, "2026-10-18T03:00:00.000Z")).ok).toBe(true);
    expect(map.has(trackScorecardChunkTicker(1))).toBe(false);
    expect(map.has(trackScorecardChunkTicker(2))).toBe(false);
    expect(map.get(TRACK_SCORECARD_TICKER)?.startsWith("z1:")).toBe(true);
    const loaded = await loadTrackRecordView(rows);
    expect(loaded.kind).toBe("ready");
    if (loaded.kind === "ready") expect(loaded.view.misses).toBe(1);
  });

  it("returns a read error quickly when the store does not answer", async () => {
    let cancel: () => void = () => undefined;
    const rows: ScorecardRows = {
      read: () =>
        new Promise<string | null>((_, reject) => {
          cancel = () => reject(new Error("cancelled"));
        }),
      write: async () => undefined,
    };
    const started = Date.now();
    const out = await loadTrackRecordView(rows, 40);
    const elapsed = Date.now() - started;
    cancel();
    expect(out).toEqual({ kind: "error", error: "The stored scorecard could not be read in time." });
    expect(elapsed).toBeLessThan(500);
  });

  it("a broken stored row is an error, not a made-up zero card", async () => {
    const { map, rows } = memoryRows();
    map.set(TRACK_SCORECARD_TICKER, "{");
    const out = await loadTrackRecordView(rows);
    expect(out).toEqual({ kind: "error", error: "The stored scorecard could not be read." });
  });

  it("the page only reads, the cron stores, and the watchlist hides the row", () => {
    const page = read("src/app/test-hooks/track-record/page.tsx");
    expect(page).toMatch(/currentUserMayUseTestHooks\(\)\)\) notFound\(\)/);
    expect(page).toContain("loadTrackRecordView");
    // b28 review: the only build on the page is the bounded fallback when nothing is stored.
    expect(page).not.toMatch(/runTrackRecord\(/);
    expect(page).not.toMatch(/c\.ticker|c\.signal|calls\.map|reportId/);
    expect(page).toContain("data-scorecard-hash");
    expect(page).toContain("data-hash-check");
    expect(page).toContain("data-misses");
    expect(page).toContain("misses included");
    expect(page).toContain("No scorecard is stored yet");
    const cron = read("src/app/api/cron/track-record/route.ts");
    expect(cron).toMatch(/persistTrackRun\(run[,)]/);
    expect(cron).toContain("scorecardHash: run.card.scorecardHash");
    expect(cron).not.toMatch(/data: run\.card[,\s]/);
    expect(cron).not.toMatch(/searchParams\.get\("key"\)/);
    const store = read("src/lib/track-record-store.server.ts");
    expect(store).not.toContain("runTrackRecord");
    expect(store).not.toContain("laterPricesFor");
    expect(isTrackScorecardTicker("AF-TRS")).toBe(true);
    expect(isTrackScorecardTicker("af-trs-12")).toBe(true);
    expect(isTrackScorecardTicker("AIR.NZ")).toBe(false);
    const watch = read("src/app/api/watchlist/route.ts");
    expect(watch).toContain("isTrackScorecardTicker");
    expect(watch.match(/isTrackScorecardTicker/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
