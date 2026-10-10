import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { fetchRankedMarkets, redactSwyftxLog, resetSwyftxForTests } from "@/lib/crypto-swyftx";

/**
 * Fake key and token. No live Swyftx call, and no production key.
 * Production reads SWYFTX_API_KEY from Totalum env vars.
 */
const FAKE_KEY = "swyftx-test-key-not-real";
const FAKE_TOKEN = "swyftx-test-access-token";

const BASIC = [
  { id: 1, code: "BTC", name: "Bitcoin", rank: 1, buy: "1", sell: "1", volume24H: 10, marketCap: 2_000 },
  { id: 2, code: "AUD", name: "Australian Dollar", rank: 1, buy: "1", sell: "1", volume24H: 1, marketCap: 1 },
  { id: 3, code: "ETH", name: "Ethereum", rank: 2, buy: "1", sell: "1", volume24H: 8, marketCap: 500 },
];

const RATES = {
  "1": { midPrice: "100000", askPrice: "100001", bidPrice: "99999", dailyPriceChange: "1.2" },
  "3": { midPrice: "3000", askPrice: "3001", bidPrice: "2999", dailyPriceChange: "-0.4" },
};

interface Call {
  url: string;
  method: string;
  body: string;
  authorization: string;
}

function installFetch(authStatus: number, authBody: string) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      calls.push({
        url,
        method: init?.method || "GET",
        body: typeof init?.body === "string" ? init.body : "",
        authorization: headers.get("authorization") || "",
      });
      if (url.includes("/auth/refresh/")) {
        return new Response(authBody, { status: authStatus, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/markets/info/basic/")) {
        return new Response(JSON.stringify(BASIC), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/live-rates/")) {
        return new Response(JSON.stringify(RATES), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response("missing", { status: 404 });
    })
  );
  return calls;
}

describe("Swyftx key exchange", () => {
  const previousKey = process.env.SWYFTX_API_KEY;
  let log: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetSwyftxForTests();
    log = vi.spyOn(console, "log").mockImplementation(() => {});
    error = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    resetSwyftxForTests();
    vi.unstubAllGlobals();
    log.mockRestore();
    error.mockRestore();
    if (previousKey == null) delete process.env.SWYFTX_API_KEY;
    else process.env.SWYFTX_API_KEY = previousKey;
  });

  function loggedText(): string {
    return [...log.mock.calls, ...error.mock.calls].map((args) => args.map((part) => String(part)).join(" ")).join("\n");
  }

  it("exchanges the key once, caches the token, and does not log either secret", async () => {
    process.env.SWYFTX_API_KEY = FAKE_KEY;
    const calls = installFetch(200, JSON.stringify({ accessToken: FAKE_TOKEN }));

    const first = await fetchRankedMarkets(400);
    expect(first.map((row) => row.symbol)).toEqual(["BTC", "ETH"]);
    expect(first.find((row) => row.symbol === "BTC")?.price).toBe(100000);

    const refresh = calls.filter((call) => call.url.includes("/auth/refresh/"));
    expect(refresh).toHaveLength(1);
    expect(refresh[0].method).toBe("POST");
    expect(JSON.parse(refresh[0].body)).toEqual({ apiKey: FAKE_KEY });
    const priced = calls.filter((call) => !call.url.includes("/auth/refresh/"));
    expect(priced.length).toBeGreaterThan(0);
    expect(priced.every((call) => call.authorization === `Bearer ${FAKE_TOKEN}`)).toBe(true);

    resetSwyftxForTests("data");
    await fetchRankedMarkets(400);
    expect(calls.filter((call) => call.url.includes("/auth/refresh/"))).toHaveLength(1);

    const text = loggedText();
    expect(text).not.toContain(FAKE_KEY);
    expect(text).not.toContain(FAKE_TOKEN);
    expect(text).toContain("Swyftx session started");
  });

  it("keeps the public routes when the key is absent", async () => {
    delete process.env.SWYFTX_API_KEY;
    const calls = installFetch(500, "{}");

    const rows = await fetchRankedMarkets(400);
    expect(rows.map((row) => row.symbol)).toEqual(["BTC", "ETH"]);
    expect(calls.some((call) => call.url.includes("/auth/refresh/"))).toBe(false);
    expect(calls.every((call) => call.authorization === "")).toBe(true);
    expect(loggedText()).not.toContain(FAKE_TOKEN);
  });

  it("continues keyless when the refresh endpoint rejects the key", async () => {
    process.env.SWYFTX_API_KEY = FAKE_KEY;
    const calls = installFetch(401, JSON.stringify({ apiKey: FAKE_KEY, accessToken: FAKE_TOKEN }));

    const rows = await fetchRankedMarkets(400);
    expect(rows).toHaveLength(2);
    expect(calls.some((call) => call.url.includes("/auth/refresh/"))).toBe(true);
    const priced = calls.filter((call) => !call.url.includes("/auth/refresh/"));
    expect(priced.every((call) => call.authorization === "")).toBe(true);
    const text = loggedText();
    expect(text).toContain("continuing keyless");
    expect(text).not.toContain(FAKE_KEY);
    expect(text).not.toContain(FAKE_TOKEN);
    expect(redactSwyftxLog(`rejected ${FAKE_KEY}`)).not.toContain(FAKE_KEY);
  });
});
