/**
 * AUTH-FAIL-CLOSED: production must not create, verify, or HMAC-sign a session
 * with a missing, blank, or library-default BETTER_AUTH_SECRET.
 * A configured secret keeps the previous sign and verify behaviour.
 */
import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthSecretUnavailable, configuredAuthSecret, isUsableAuthSecret } from "@/lib/auth-secret";
import { signLastGoodSession, verifyLastGoodSession } from "@/lib/last-good-session";

vi.mock("server-only", () => ({}));

const LIBRARY = "better-auth-secret-123456789";
const BLANKS = [undefined, "", " ", "\n", "\t", " \n\t "] as const;

function leaked(blob: string, secret?: string): boolean {
  if (blob.includes(LIBRARY)) return true;
  return Boolean(secret && secret.trim() && blob.includes(secret));
}

describe("AUTH-FAIL-CLOSED", () => {
  const prevEnv = process.env.NODE_ENV;
  const prevSecret = process.env.BETTER_AUTH_SECRET;

  afterEach(() => {
    process.env.NODE_ENV = prevEnv;
    if (prevSecret === undefined) delete process.env.BETTER_AUTH_SECRET;
    else process.env.BETTER_AUTH_SECRET = prevSecret;
    vi.resetModules();
  });

  it("rejects blank and library-default values before they can be configured", () => {
    for (const secret of [...BLANKS, LIBRARY, `  ${LIBRARY}  `]) {
      expect(isUsableAuthSecret(secret)).toBe(false);
      expect(configuredAuthSecret({ BETTER_AUTH_SECRET: secret } as NodeJS.ProcessEnv)).toBeUndefined();
    }
  });

  it("production auth context refuses every unusable secret and does not echo it", async () => {
    const logs: string[] = [];
    const error = console.error;
    const warn = console.warn;
    console.error = (...args: unknown[]) => { logs.push(args.map(String).join(" ")); };
    console.warn = (...args: unknown[]) => { logs.push(args.map(String).join(" ")); };
    try {
      for (const secret of [...BLANKS, LIBRARY, ` ${LIBRARY} `]) {
        vi.resetModules();
        process.env.NODE_ENV = "production";
        if (secret === undefined) delete process.env.BETTER_AUTH_SECRET;
        else process.env.BETTER_AUTH_SECRET = secret;
        const { auth } = await import("@/lib/auth");
        let message = "";
        try {
          const ctx = await auth.$context;
          message = `context resolved with secret length ${String(ctx.secret || "").length}`;
        } catch (err) {
          message = err instanceof Error ? `${err.name}: ${err.message}` : "non-error";
          expect(err instanceof Error && err.name).toBe("AuthSecretUnavailable");
        }
        expect(message).toBe("AuthSecretUnavailable: Sign-in is unavailable.");
        const blob = `${message}\n${logs.join("\n")}`;
        if (leaked(blob, secret)) throw new Error("output contained a rejected secret");
      }
    } finally {
      console.error = error;
      console.warn = warn;
    }
  });

  it("production fallback HMAC will not sign or accept a blank or library-default secret", async () => {
    process.env.NODE_ENV = "test";
    const signedWithDefault = await signLastGoodSession(LIBRARY, "tok-1", { id: "u1", email: "a@b.c" }, 0);
    process.env.NODE_ENV = "production";
    for (const secret of ["", "   ", LIBRARY, ` ${LIBRARY} `]) {
      await expect(signLastGoodSession(secret, "tok-1", { id: "u1", email: "a@b.c" }, 0)).rejects.toBeInstanceOf(AuthSecretUnavailable);
      expect(await verifyLastGoodSession(secret, "tok-1", signedWithDefault, 1000)).toBeNull();
    }
    const err = await signLastGoodSession(LIBRARY, "tok-1", { id: "u1", email: "a@b.c" }, 0).catch((e: unknown) => e);
    const text = err instanceof Error ? `${err.name}: ${err.message}` : "";
    expect(text).toBe("AuthSecretUnavailable: Sign-in is unavailable.");
    if (leaked(text)) throw new Error("output contained a rejected secret");
  });

  it("a configured secret still signs and verifies outside production", async () => {
    process.env.NODE_ENV = "test";
    const secret = randomBytes(32).toString("hex");
    process.env.BETTER_AUTH_SECRET = secret;
    expect(configuredAuthSecret()).toBe(secret);
    const value = await signLastGoodSession(secret, "tok-1", { id: "u1", email: "a@b.c", name: "A" }, 0);
    expect((await verifyLastGoodSession(secret, "tok-1", value, 1000))?.uid).toBe("u1");
    expect(await verifyLastGoodSession("other-secret", "tok-1", value, 1000)).toBeNull();
  });

  it("production uses that same configured secret for context and fallback HMAC", async () => {
    const secret = randomBytes(32).toString("hex");
    process.env.NODE_ENV = "production";
    process.env.BETTER_AUTH_SECRET = secret;
    vi.resetModules();
    const { auth } = await import("@/lib/auth");
    const ctx = await auth.$context;
    expect(ctx.secret).toBe(secret);
    const value = await signLastGoodSession(ctx.secret, "tok-9", { id: "u9", email: "c@d.e" }, 0);
    expect((await verifyLastGoodSession(ctx.secret, "tok-9", value, 1000))?.uid).toBe("u9");
    expect(await verifyLastGoodSession(LIBRARY, "tok-9", value, 1000)).toBeNull();
  });

  it("a public session lookup without a secret stays signed out", async () => {
    const logs: string[] = [];
    const error = console.error;
    console.error = (...args: unknown[]) => { logs.push(args.map(String).join(" ")); };
    try {
      vi.resetModules();
      process.env.NODE_ENV = "production";
      delete process.env.BETTER_AUTH_SECRET;
      vi.doMock("next/headers", () => ({ headers: async () => new Headers() }));
      const { getCurrentUser } = await import("@/lib/session");
      expect(await getCurrentUser()).toBeNull();
      if (leaked(logs.join("\n"))) throw new Error("output contained a rejected secret");
    } finally {
      console.error = error;
      vi.doUnmock("next/headers");
    }
  });
});
