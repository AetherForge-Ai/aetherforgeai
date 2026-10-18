import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { readFileSync } from "node:fs";

const s = vi.hoisted(() => ({ saved: 0, user: { _id: "u1" } as { _id: string } | null }));
vi.mock("@/lib/session", () => ({ getTradeSessionUser: vi.fn(async () => s.user) }));
vi.mock("@/lib/ip-rate-limit", () => ({ takeRateLimit: vi.fn(async () => ({ allowed: true, resetSec: 0 })) }));
vi.mock("@/lib/broker-sync/connection-store.server", () => ({
  findConnection: vi.fn(async () => null),
  publicConnection: (c: unknown) => c,
  saveConnection: vi.fn(async () => {
    s.saved += 1;
  }),
  deleteConnection: vi.fn(async () => true),
  listActiveConnections: vi.fn(async () => []),
  markSync: vi.fn(),
}));
vi.mock("@/lib/totalum", () => ({ totalumSdk: { crud: { query: vi.fn(async () => ({ data: [] })), getRecordById: vi.fn() } } }));
vi.mock("@/lib/transactions", () => ({ applyTransaction: vi.fn() }));
vi.mock("@/lib/book-cache", () => ({ invalidateBookCache: vi.fn() }));
vi.mock("@/lib/import/persist", () => ({ runH10Import: vi.fn() }));

import { POST as connect } from "@/app/api/broker/ibkr/route";
import { GET as cronGet, POST as cronPost } from "@/app/api/cron/broker-sync/route";
import { flexCashRows, flexTradesCsv } from "./ibkr-flex";
import { parseCsv } from "@/lib/import/csv";
import { parseIbkr } from "@/lib/import/parsers/ibkr";
import { randomBytes } from "node:crypto";

const TOKEN = "1234567890123456789012";
const req = (body: unknown) => new Request("https://x/api/broker/ibkr", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  s.saved = 0;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.stubEnv("BROKER_TOKEN_KEY", randomBytes(32).toString("base64"));
});

describe("BS-01 invalid token: clear error, nothing saved", () => {
  it("rejects a malformed token without calling IBKR", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const res = await connect(req({ token: "not-a-token", queryId: "123456" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Flex token/);
    expect(f).not.toHaveBeenCalled();
    expect(s.saved).toBe(0);
  });
  it("rejects a token IBKR refuses (1015) and saves nothing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<FlexStatementResponse><Status>Fail</Status><ErrorCode>1015</ErrorCode></FlexStatementResponse>")));
    const res = await connect(req({ token: TOKEN, queryId: "123456" }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/token is not valid.*Nothing was saved/);
    expect(JSON.stringify(body)).not.toContain(TOKEN);
    expect(s.saved).toBe(0);
  });
  it("saves a token IBKR accepts and never echoes it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<FlexStatementResponse><Status>Success</Status><ReferenceCode>42</ReferenceCode></FlexStatementResponse>")));
    const res = await connect(req({ token: TOKEN, queryId: "123456" }));
    expect(res.status).toBe(200);
    expect(JSON.stringify(await res.json())).not.toContain(TOKEN);
    expect(s.saved).toBe(1);
  });
});

describe("BS-01 cron route needs the secret", () => {
  it("401 with no secret or a wrong one; 503 when unset", async () => {
    vi.stubEnv("CRON_SECRET", "right-secret-value");
    for (const h of [{}, { "x-cron-secret": "wrong" }, { authorization: "Bearer wrong" }]) {
      expect((await cronGet(new Request("https://x/api/cron/broker-sync", { headers: h }))).status).toBe(401);
      expect((await cronPost(new Request("https://x/api/cron/broker-sync", { method: "POST", headers: h }))).status).toBe(401);
    }
    expect((await cronGet(new Request("https://x/api/cron/broker-sync?key=right-secret-value"))).status).toBe(401);
    expect((await cronGet(new Request("https://x/api/cron/broker-sync", { headers: { "x-cron-secret": "right-secret-value" } }))).status).toBe(200);
    vi.stubEnv("CRON_SECRET", "");
    expect((await cronGet(new Request("https://x/api/cron/broker-sync"))).status).toBe(503);
  });
});

describe("BS-01 fixture statement reconciles within NZ$0.01", () => {
  it("trades and cash match the statement", () => {
    const xml = readFileSync("src/lib/broker-sync/fixtures/ibkr-flex-statement.xml", "utf8");
    const draft = parseIbkr(parseCsv(flexTradesCsv(xml))) as unknown as { rows: Array<{ cashEffectNzd: number; brokerRef: string; quantity: number }> };
    expect(draft.rows.map((r) => r.brokerRef)).toEqual(["ibkr-1001", "ibkr-1002"]);
    const tradeCash = draft.rows.reduce((a, r) => a + r.cashEffectNzd, 0);
    // buy: -(400 + 1) * 1.7 = -681.70; sell: (210 - 1) * 1.7 = 355.30
    expect(Math.abs(tradeCash - -326.4)).toBeLessThanOrEqual(0.01);
    const cash = flexCashRows(xml);
    const cashNzd = cash.reduce((a, c) => a + Math.round(c.amount * (c.fxRateToBase ?? 1) * 100) / 100, 0);
    expect(Math.abs(cashNzd - 1002.04)).toBeLessThanOrEqual(0.01);
  });
  it("no Math.random in broker sync code", () => {
    for (const f of ["ibkr-flex.ts", "ibkr-sync.server.ts", "token-crypto.server.ts", "connection-store.server.ts"]) {
      expect(readFileSync(`src/lib/broker-sync/${f}`, "utf8")).not.toContain("Math.random");
    }
  });
});
