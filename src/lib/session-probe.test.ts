import { afterEach, describe, expect, it } from "vitest";
import { confirmPageSession, confirmSessionUser, refreshSessionSingleFlight } from "@/lib/auth-refresh";

const user1t = {
  id: "user-1t",
  email: "tinikog589@stenmax.com",
  name: "AetherForge 1T",
};

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as Response;
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
  Reflect.deleteProperty(globalThis, "fetch");
});

describe("live session probe", () => {
  it("does not rotate when the strict read already has the owner", async () => {
    const calls: string[] = [];
    globalThis.window = {} as Window & typeof globalThis;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return jsonResponse({ user: user1t, session: { id: "s" } });
    }) as typeof fetch;

    const user = await confirmPageSession();
    expect(user?.id).toBe("user-1t");
    expect(calls).toEqual([
      "/api/auth/get-session?disableCookieCache=true&disableRefresh=true",
    ]);
  });

  it("uses the single refresh flight once when the page read is empty", async () => {
    const calls: string[] = [];
    let strictReads = 0;
    globalThis.window = {} as Window & typeof globalThis;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("disableRefresh")) {
        strictReads += 1;
        if (strictReads === 1) return jsonResponse(null);
        return jsonResponse({ user: user1t, session: { id: "s" } });
      }
      await new Promise((r) => setTimeout(r, 20));
      return jsonResponse({ user: user1t, session: { id: "s" } });
    }) as typeof fetch;

    const [a, b] = await Promise.all([confirmPageSession(), confirmPageSession()]);
    expect(a?.id).toBe("user-1t");
    expect(b?.id).toBe("user-1t");
    expect(calls.filter((url) => url === "/api/auth/get-session")).toHaveLength(1);
    expect(calls.filter((url) => url.includes("disableRefresh"))).toHaveLength(2);
  });

  it("does not refresh the nav when the atom has no user", async () => {
    const calls: string[] = [];
    globalThis.window = {} as Window & typeof globalThis;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return jsonResponse(null);
    }) as typeof fetch;

    const user = await confirmSessionUser(null);
    expect(user).toBeNull();
    expect(calls).toEqual([
      "/api/auth/get-session?disableCookieCache=true&disableRefresh=true",
    ]);
  });

  it("shares one rotating refresh across overlapping 401 recoveries", async () => {
    let refreshes = 0;
    globalThis.window = {} as Window & typeof globalThis;
    globalThis.fetch = (async () => {
      refreshes += 1;
      await new Promise((r) => setTimeout(r, 15));
      return jsonResponse({ user: user1t, session: { id: "s" } });
    }) as typeof fetch;

    const [a, b] = await Promise.all([
      refreshSessionSingleFlight(),
      refreshSessionSingleFlight(),
    ]);
    expect(a).toBe(true);
    expect(b).toBe(true);
    expect(refreshes).toBe(1);
  });
});
