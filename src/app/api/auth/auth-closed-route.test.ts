/**
 * AUTH-FAIL-CLOSED route adapters. A production secret that is missing, blank,
 * or the library default answers 503 before consent, rate limits, Better Auth,
 * HMAC, or the database. A configured secret keeps those policies.
 */
import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => {
  const betterAuth = vi.fn((options: { secret?: string }) => ({
    handler: async () => new Response(JSON.stringify({ reached: true }), { status: 200, headers: { "content-type": "application/json", "cache-control": "private" } }),
    $context: Promise.resolve({
      secret: options?.secret,
      authCookies: {
        sessionToken: { name: "better-auth.session_token" },
        sessionData: { name: "better-auth.session_data" },
      },
      internalAdapter: { findSession: async () => null },
    }),
    api: {},
  }));
  return {
    betterAuth,
    createRecord: vi.fn(async () => ({ data: { _id: "row" } })),
    query: vi.fn(async () => ({ data: [] as unknown[] })),
  };
});

vi.mock("better-auth", async () => {
  const actual = await vi.importActual<typeof import("better-auth")>("better-auth");
  return {
    ...actual,
    betterAuth: (options: unknown) => h.betterAuth(options),
  };
});

vi.mock("@/lib/totalum", () => ({
  totalumSdk: {
    changeBaseUrl() {},
    crud: {
      createRecord: (...args: unknown[]) => h.createRecord(...args),
      query: (...args: unknown[]) => h.query(...args),
      getRecordById: vi.fn(async () => ({ data: {} })),
      deleteRecordById: vi.fn(async () => ({})),
      updateRecordById: vi.fn(async () => ({})),
    },
  },
}));

const LIBRARY = "better-auth-secret-123456789";
const UNUSABLE = [undefined, "", " ", "\n", "\t", LIBRARY, ` ${LIBRARY} `] as const;

function leaked(blob: string, secret?: string): boolean {
  if (blob.includes(LIBRARY)) return true;
  return Boolean(secret && secret.trim() && blob.includes(secret));
}

function call(path: string, method: "GET" | "POST", body?: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.50" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function loadRoute() {
  vi.resetModules();
  return import("@/app/api/auth/[...all]/route");
}

describe("auth route when production secret is unusable", () => {
  const prevEnv = process.env.NODE_ENV;
  const prevSecret = process.env.BETTER_AUTH_SECRET;
  const sign = crypto.subtle.sign.bind(crypto.subtle);
  let signatures = 0;

  afterEach(() => {
    process.env.NODE_ENV = prevEnv;
    if (prevSecret === undefined) delete process.env.BETTER_AUTH_SECRET;
    else process.env.BETTER_AUTH_SECRET = prevSecret;
    crypto.subtle.sign = sign;
    vi.restoreAllMocks();
  });

  it("GET and POST return 503 no-store with no cookie, constructor, HMAC, or database write", async () => {
    crypto.subtle.sign = (async (...args: Parameters<SubtleCrypto["sign"]>) => {
      signatures += 1;
      return sign(...args);
    }) as SubtleCrypto["sign"];
    process.env.NODE_ENV = "production";
    for (const secret of UNUSABLE) {
      if (secret === undefined) delete process.env.BETTER_AUTH_SECRET;
      else process.env.BETTER_AUTH_SECRET = secret;
      h.betterAuth.mockClear();
      h.createRecord.mockClear();
      h.query.mockClear();
      const before = signatures;
      const { GET, POST } = await loadRoute();
      const gets = [
        await GET(call("/api/auth/get-session", "GET")),
        await GET(call("/api/auth/ok", "GET")),
      ];
      const posts = [
        await POST(call("/api/auth/sign-in/email", "POST", { email: "person@example.com" })),
        await POST(call("/api/auth/sign-up/email", "POST", { email: "person@example.com" })),
      ];
      for (const res of [...gets, ...posts]) {
        const text = await res.text();
        expect(res.status).toBe(503);
        expect(res.headers.get("cache-control")).toBe("no-store");
        expect(res.headers.get("set-cookie")).toBeNull();
        expect(text).toBe(JSON.stringify({ message: "Sign-in is unavailable." }));
        if (leaked(text, secret)) throw new Error("response contained a rejected secret");
      }
      expect(h.betterAuth).not.toHaveBeenCalled();
      expect(h.createRecord).not.toHaveBeenCalled();
      expect(h.query).not.toHaveBeenCalled();
      expect(signatures).toBe(before);
    }
  });

  it("a configured secret still rejects consent before Better Auth and still reaches the handler after consent", async () => {
    const secret = randomBytes(32).toString("hex");
    process.env.NODE_ENV = "production";
    process.env.BETTER_AUTH_SECRET = secret;
    h.betterAuth.mockClear();
    const { POST } = await loadRoute();
    const denied = await POST(call("/api/auth/sign-up/email", "POST", { email: "person@example.com" }));
    expect(denied.status).toBe(400);
    expect(await denied.json()).toEqual({ message: "Confirm you are 18 or over before creating an account." });
    expect(denied.headers.get("set-cookie")).toBeNull();
    expect(h.betterAuth).not.toHaveBeenCalled();

    const accepted = await POST(call("/api/auth/sign-up/email", "POST", { email: "person@example.com", age_confirmed: "yes" }));
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toEqual({ reached: true });
    expect(accepted.headers.get("set-cookie")).toBeNull();
    expect(h.betterAuth).toHaveBeenCalledTimes(1);
    expect(h.betterAuth.mock.calls[0]?.[0]).toMatchObject({ secret });
  });

  it("public session lookup with no secret stays signed out and does not construct Better Auth", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.BETTER_AUTH_SECRET;
    h.betterAuth.mockClear();
    vi.resetModules();
    vi.doMock("next/headers", () => ({ headers: async () => new Headers() }));
    const { getCurrentUser } = await import("@/lib/session");
    expect(await getCurrentUser()).toBeNull();
    expect(h.betterAuth).not.toHaveBeenCalled();
    vi.doUnmock("next/headers");
  });
});
