/** b64 BS-01: sandbox IBKR connect / sync / disconnect for allow-listed test accounts only. */
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { randomBytes } from "node:crypto";

const s = vi.hoisted(() => ({
  user: { _id: "tt1" } as { _id: string } | null,
  row: null as null | { _id: string; user: string; broker: "ibkr"; enc_token: string; query_id: string; last_sync: string | null; status: "active"; last_error: string | null },
  applied: 0,
}));
vi.mock("@/lib/session", () => ({ getTradeSessionUser: vi.fn(async () => s.user) }));
vi.mock("@/lib/broker-sync/connection-store.server", () => ({
  findConnection: vi.fn(async () => s.row),
  publicConnection: (c: { query_id: string; status: string } | null) => (c ? { broker: "ibkr", queryId: c.query_id, status: c.status } : null),
  saveConnection: vi.fn(async (user: string, _b: string, enc: string, q: string) => {
    s.row = { _id: "r1", user, broker: "ibkr", enc_token: enc, query_id: q, last_sync: null, status: "active", last_error: null };
  }),
  deleteConnection: vi.fn(async () => {
    const had = !!s.row;
    s.row = null;
    return had;
  }),
  markSync: vi.fn(async () => undefined),
}));
vi.mock("@/lib/totalum", () => ({ totalumSdk: { crud: { query: vi.fn(async () => ({ data: [] })) } } }));
vi.mock("@/lib/transactions", () => ({ applyTransaction: vi.fn(async () => { s.applied += 1; }) }));
vi.mock("@/lib/book-cache", () => ({ invalidateBookCache: vi.fn() }));
vi.mock("@/lib/import/persist", () => ({ runH10Import: vi.fn(async () => new Response(JSON.stringify({ ok: true, data: { written: 2, duplicates: [] } }))) }));

import { DELETE, GET, POST } from "@/app/api/test-hooks/ibkr-sandbox/route";
import { SANDBOX_QUERY_ID, SANDBOX_TOKEN_EXPIRED, SANDBOX_TOKEN_INVALID, SANDBOX_TOKEN_OK, isSandboxConnection, sandboxVerify } from "./ibkr-sandbox";
import { syncConnection } from "./ibkr-sync.server";

const post = (body: unknown) => POST(new Request("https://x/api/test-hooks/ibkr-sandbox", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  s.user = { _id: "tt1" };
  s.row = null;
  s.applied = 0;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.stubEnv("BROKER_TOKEN_KEY", randomBytes(32).toString("base64"));
  vi.stubEnv("GOAL_TEST_HOOKS", "1");
  vi.stubEnv("GOAL_TEST_HOOK_USER_IDS", "other, tt1");
});

describe("BS-01 sandbox gate: 404 unless switch on and allow-listed", () => {
  it("GOAL_TEST_HOOKS unset → 404 on every method", async () => {
    vi.stubEnv("GOAL_TEST_HOOKS", "");
    expect((await GET()).status).toBe(404);
    expect((await post({})).status).toBe(404);
    expect((await DELETE()).status).toBe(404);
    expect(s.row).toBeNull();
  });
  it("switch on but user not in GOAL_TEST_HOOK_USER_IDS → 404", async () => {
    s.user = { _id: "member9" };
    expect((await GET()).status).toBe(404);
    expect((await post({})).status).toBe(404);
    expect((await DELETE()).status).toBe(404);
  });
  it("signed out → 404", async () => {
    s.user = null;
    expect((await post({})).status).toBe(404);
  });
});

describe("BS-01 sandbox connect, sync, disconnect", () => {
  it("never calls IBKR", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    await post({});
    await post({ action: "sync" });
    expect(f).not.toHaveBeenCalled();
  });
  it("connect stores ciphertext (not the token) under the sandbox query id", async () => {
    const res = await post({ token: SANDBOX_TOKEN_OK });
    expect(res.status).toBe(200);
    expect(s.row?.query_id).toBe(SANDBOX_QUERY_ID);
    expect(s.row?.enc_token).not.toContain(SANDBOX_TOKEN_OK);
    expect(JSON.stringify(await res.json())).not.toContain(SANDBOX_TOKEN_OK);
  });
  it("invalid and expired sandbox tokens are refused, nothing saved", async () => {
    const bad = await post({ token: SANDBOX_TOKEN_INVALID });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toMatch(/token is not valid.*Nothing was saved/);
    const exp = await post({ token: SANDBOX_TOKEN_EXPIRED });
    expect((await exp.json()).error).toMatch(/expired/);
    expect((await post({ token: "abc" })).status).toBe(400);
    expect(s.row).toBeNull();
  });
  it("sync applies the fixture; sync without a connection is 404", async () => {
    expect((await post({ action: "sync" })).status).toBe(404);
    await post({});
    const res = await post({ action: "sync" });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toMatchObject({ ok: true, trades: 2, cash: 2 });
  });
  it("disconnect deletes the row; a second disconnect removes nothing", async () => {
    await post({});
    expect((await (await DELETE()).json()).data.removed).toBe(true);
    expect(s.row).toBeNull();
    expect((await (await DELETE()).json()).data.removed).toBe(false);
  });
  it("GET shows the sandbox tokens and status, never ciphertext", async () => {
    await post({});
    const body = await (await GET()).json();
    expect(body).toMatchObject({ ok: true, sandbox: true, isSandbox: true, tokens: { ok: SANDBOX_TOKEN_OK } });
    expect(JSON.stringify(body)).not.toContain(s.row!.enc_token);
  });
});

describe("BS-01 sandbox rows outside the allow-list", () => {
  it("the sync worker refuses a sandbox row for a non-allow-listed member and calls nobody", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const out = await syncConnection({ _id: "member9" } as never, { _id: "r", user: "member9", broker: "ibkr", enc_token: "x", query_id: SANDBOX_QUERY_ID, last_sync: null, status: "active", last_error: null });
    expect(out.ok).toBe(false);
    expect(out.message).toMatch(/sandbox/i);
    expect(f).not.toHaveBeenCalled();
    expect(s.applied).toBe(0);
  });
  it("pure helpers", () => {
    expect(sandboxVerify(SANDBOX_TOKEN_OK).ok).toBe(true);
    expect(isSandboxConnection({ query_id: SANDBOX_QUERY_ID })).toBe(true);
    expect(isSandboxConnection({ query_id: "123456" })).toBe(false);
  });
});
