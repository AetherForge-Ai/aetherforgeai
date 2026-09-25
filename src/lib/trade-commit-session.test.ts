import { afterEach, describe, expect, it } from "vitest";
import { bindActiveAccount, __resetAccountIdentityForTests } from "@/lib/account-identity";
import { api } from "@/lib/api";
import {
  confirmedCommit401Action,
  isConfirmedCommitBody,
  isPortfolioSessionRead,
  portfolioLoadFailure,
  sessionWriteResult,
  stableConfirmDecision,
} from "@/lib/trade-commit-session";

const sellBody = {
  type: "sell",
  ticker: "SNX",
  asset_type: "crypto",
  quantity: 6.5259,
  price: 1.2,
  confirm: true,
};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

afterEach(() => {
  __resetAccountIdentityForTests();
  Reflect.deleteProperty(globalThis, "window");
  Reflect.deleteProperty(globalThis, "fetch");
});

describe("confirmed trade session", () => {
  it("treats only confirm: true as a confirmed commit", () => {
    expect(isConfirmedCommitBody(JSON.stringify(sellBody))).toBe(true);
    expect(isConfirmedCommitBody(JSON.stringify({ ...sellBody, confirm: false }))).toBe(false);
    expect(isConfirmedCommitBody(JSON.stringify({ type: "sell", ticker: "SNX" }))).toBe(false);
    expect(isConfirmedCommitBody("not-json")).toBe(false);
  });

  it("does not send a confirmed trade when the stable session is missing", () => {
    expect(
      stableConfirmDecision({ ok: true, userId: null, activeUserId: "user-1t" }),
    ).toBe("unauthorized");
    expect(
      stableConfirmDecision({ ok: true, userId: "user-1t", activeUserId: "user-1t" }),
    ).toBe("send");
    expect(
      stableConfirmDecision({ ok: false, userId: "user-tt", activeUserId: "user-1t" }),
    ).toBe("mismatch");
  });

  it("retries a confirmed 401 once and refuses the other paper book", () => {
    expect(
      confirmedCommit401Action({
        alreadyRetried: false,
        tradeRefreshUsed: false,
        liveUserId: "user-1t",
        activeUserId: "user-1t",
      }),
    ).toBe("retry");
    expect(
      confirmedCommit401Action({
        alreadyRetried: true,
        tradeRefreshUsed: true,
        liveUserId: "user-1t",
        activeUserId: "user-1t",
      }),
    ).toBe("unauthorized");
    expect(
      confirmedCommit401Action({
        alreadyRetried: false,
        tradeRefreshUsed: true,
        liveUserId: null,
        activeUserId: "user-1t",
      }),
    ).toBe("unauthorized");
    expect(
      confirmedCommit401Action({
        alreadyRetried: false,
        tradeRefreshUsed: false,
        liveUserId: "user-tt",
        activeUserId: "user-1t",
      }),
    ).toBe("mismatch");
  });

  it("keeps the existing session row when a session update write fails", () => {
    const existing = { token: "tok", expiresAt: new Date("2026-10-01T00:00:00.000Z") };
    expect(sessionWriteResult("session", null, existing)).toBe(existing);
    expect(sessionWriteResult("session", { token: "tok-2" }, existing)).toEqual({ token: "tok-2" });
    expect(sessionWriteResult("user", null, { id: "user-1t" })).toBeNull();
  });

  it("retries a confirmed crypto sell once with confirm: true after a 401", async () => {
    globalThis.window = {} as Window & typeof globalThis;
    bindActiveAccount("user-1t");
    const posts: string[] = [];
    let postCount = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/session")) {
        return jsonResponse({
          user: { id: "user-1t", email: "tinikog589@stenmax.com", name: "AetherForge 1T" },
          session: { id: "s" },
        });
      }
      postCount += 1;
      posts.push(String(init?.body));
      if (postCount === 1) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
      return jsonResponse({ ok: true, data: { cashBalance: 10 } }, 200);
    }) as typeof fetch;

    const res = await api.post("/api/transactions", sellBody);
    expect(res.ok).toBe(true);
    expect(posts).toHaveLength(2);
    expect(posts[0]).toContain('"confirm":true');
    expect(posts[1]).toBe(posts[0]);
    expect(posts[0]).not.toContain('"confirm":false');
  });

  it("does not send the sell when the live session is the other paper book", async () => {
    globalThis.window = {} as Window & typeof globalThis;
    bindActiveAccount("user-1t");
    let posts = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/session")) {
        return jsonResponse({
          user: { id: "user-tt", email: "lukassouthey@outlook.co.nz", name: "Lukas Southey" },
          session: { id: "s" },
        });
      }
      posts += 1;
      return jsonResponse({ ok: true }, 200);
    }) as typeof fetch;

    const res = await api.post("/api/transactions", sellBody);
    expect(res.ok).toBe(false);
    expect(res.status).toBe(409);
    expect(posts).toBe(0);
  });

  it("treats the holdings list as a session read and a 401 as not a portfolio outage", () => {
    expect(isPortfolioSessionRead("/api/stocks")).toBe(true);
    expect(isPortfolioSessionRead("/api/stocks?asset_type=crypto")).toBe(true);
    expect(isPortfolioSessionRead("/api/transactions")).toBe(true);
    expect(isPortfolioSessionRead("/api/metals")).toBe(true);
    expect(isPortfolioSessionRead("/api/metals/spot")).toBe(false);
    expect(isPortfolioSessionRead("/api/stocks/refresh", "POST")).toBe(false);
    expect(isPortfolioSessionRead("/api/transactions", "POST")).toBe(false);
    expect(portfolioLoadFailure(true, 200)).toBe("silent");
    expect(portfolioLoadFailure(false, 401)).toBe("silent");
    expect(portfolioLoadFailure(false, 409)).toBe("silent");
    expect(portfolioLoadFailure(false, 500)).toBe("toast");
  });

  it("retries the first portfolio load once after a 401", async () => {
    globalThis.window = {} as Window & typeof globalThis;
    bindActiveAccount("user-tt");
    let gets = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/session")) {
        return jsonResponse({
          user: { id: "user-tt", email: "lukassouthey@outlook.co.nz", name: "Lukas Southey" },
          session: { id: "s" },
        });
      }
      gets += 1;
      if (gets === 1) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
      return jsonResponse({ ok: true, data: [] }, 200);
    }) as typeof fetch;

    const res = await api.get<unknown[]>("/api/stocks");
    expect(res.ok).toBe(true);
    expect(gets).toBe(2);
  });

  it("does not rotate when the strict read already matches the account", async () => {
    globalThis.window = {} as Window & typeof globalThis;
    bindActiveAccount("user-1t");
    const urls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("/api/session")) {
        return jsonResponse({
          user: { id: "user-1t", email: "tinikog589@stenmax.com", name: "AetherForge 1T" },
          session: { id: "s" },
        });
      }
      expect(String(init?.body)).toContain('"confirm":true');
      return jsonResponse({ ok: true, data: {} }, 200);
    }) as typeof fetch;

    const res = await api.post("/api/transactions", sellBody);
    expect(res.ok).toBe(true);
    expect(urls.filter((url) => url === "/api/auth/get-session")).toHaveLength(0);
    expect(urls.some((url) => url.includes("/api/session"))).toBe(true);
  });

  it("does not POST or rotate when the stable session is empty", async () => {
    globalThis.window = {} as Window & typeof globalThis;
    bindActiveAccount("user-1t");
    const urls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("/api/session")) return jsonResponse({ user: null });
      return jsonResponse({ ok: true }, 200);
    }) as typeof fetch;

    const res = await api.post("/api/transactions", sellBody);
    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
    expect(urls.filter((url) => url === "/api/auth/get-session")).toHaveLength(0);
    expect(urls.filter((url) => url.includes("/api/transactions"))).toHaveLength(0);
  });

  it("retries confirm:true once after a 401 without calling the rotating get-session", async () => {
    globalThis.window = {} as Window & typeof globalThis;
    bindActiveAccount("user-1t");
    const urls: string[] = [];
    let posts = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("/api/session")) {
        return jsonResponse({
          user: { id: "user-1t", email: "tinikog589@stenmax.com", name: "AetherForge 1T" },
        });
      }
      posts += 1;
      expect(String(init?.body)).toContain('"confirm":true');
      if (posts === 1) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
      return jsonResponse({ ok: true, data: { cashBalance: 2780.47 } }, 200);
    }) as typeof fetch;

    const res = await api.post("/api/transactions", sellBody);
    expect(res.ok).toBe(true);
    expect(posts).toBe(2);
    expect(urls.filter((url) => url === "/api/auth/get-session")).toHaveLength(0);
  });
});
