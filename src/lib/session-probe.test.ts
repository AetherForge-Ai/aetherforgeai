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
  it("reads the stable session route and does not rotate when the owner is present", async () => {
    const calls: string[] = [];
    globalThis.window = {} as Window & typeof globalThis;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return jsonResponse({ user: user1t });
    }) as typeof fetch;

    const user = await confirmPageSession();
    expect(user?.id).toBe("user-1t");
    expect(calls).toEqual(["/api/session"]);
  });

  it("does not call the rotating get-session when the stable read is empty", async () => {
    const calls: string[] = [];
    globalThis.window = {} as Window & typeof globalThis;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return jsonResponse({ user: null });
    }) as typeof fetch;

    const [page, nav] = await Promise.all([
      confirmPageSession(),
      confirmSessionUser("user-tt"),
    ]);
    expect(page).toBeNull();
    expect(nav).toBeNull();
    expect(calls.every((url) => url === "/api/session")).toBe(true);
    expect(calls.filter((url) => url === "/api/auth/get-session")).toHaveLength(0);
  });

  it("does not refresh the nav when the atom has no user", async () => {
    const calls: string[] = [];
    globalThis.window = {} as Window & typeof globalThis;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return jsonResponse({ user: null });
    }) as typeof fetch;

    const user = await confirmSessionUser(null);
    expect(user).toBeNull();
    expect(calls).toEqual(["/api/session"]);
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
