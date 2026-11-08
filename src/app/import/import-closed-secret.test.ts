/**
 * Fresh coverage for the four historical invalid-config GET /import rows
 * (runtime-matrix indexes 29, 59, 89, 119): a non-empty synthetic session
 * cookie with an absent, empty, whitespace, or library-default production secret.
 *
 * The retained matrix stored the cookie class name "synthetic-fixture", not the
 * cookie bytes. The only retained malformed value is `%%%` (NOTE: handled like
 * no cookie; parser behavior was unknown). This test uses the class name as the
 * non-empty token. It is not a replay of the truncated historical HTML.
 *
 * Calls the real middleware and the real getCurrentUser. It does not import or
 * render the /import page, so it does not prove the HTML sentence.
 *
 * Parked HTML render, not executed (two failures, same error, do not retry):
 *   const { default: ImportPage } = await import("@/app/import/page");
 *   renderToStaticMarkup(await ImportPage());
 * Vitest config: environment "node", esbuild jsx "automatic", include src/**\/*.test.ts.
 * TypeError: (0 , jsxDEV) is not a function
 *   at ImportPage src/app/import/page.tsx:31:11
 * The first attempt called vi.resetModules() before that import. The second did not.
 * No compiled Next document-response harness for /import is in this repo.
 * src/app/test-hooks/track-record/page.test.ts renders a different page.
 * .github/workflows/h4-playwright.yml is a production credential workflow, not this case.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const bag = vi.hoisted(() => ({
  cookie: null as string | null,
  fetch: 0,
  getRecordById: 0,
  query: 0,
  createRecord: 0,
  updateRecordById: 0,
  deleteRecordById: 0,
  sendEmail: 0,
}));

const SENTINEL_EMAIL = "af-sentinel-import-member@example.test";
const SENTINEL_NAME = "AF-SENTINEL-IMPORT-MEMBER";

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (name: string) => (name.toLowerCase() === "cookie" ? bag.cookie : null),
  }),
  cookies: async () => ({
    get: (name: string) => {
      const hit = (bag.cookie || "")
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${name}=`));
      return hit ? { name, value: decodeURIComponent(hit.slice(name.length + 1)) } : undefined;
    },
  }),
}));

vi.mock("@/lib/totalum", () => ({
  totalumSdk: {
    changeBaseUrl() {},
    crud: {
      getRecordById: async () => {
        bag.getRecordById += 1;
        return { data: { _id: "sentinel-user", id: "sentinel-user", email: SENTINEL_EMAIL, name: SENTINEL_NAME } };
      },
      query: async () => {
        bag.query += 1;
        return { data: [] };
      },
      createRecord: async () => {
        bag.createRecord += 1;
        throw new Error("no writes");
      },
      updateRecordById: async () => {
        bag.updateRecordById += 1;
        throw new Error("no writes");
      },
      deleteRecordById: async () => {
        bag.deleteRecordById += 1;
        throw new Error("no writes");
      },
    },
    email: {
      sendEmail: async () => {
        bag.sendEmail += 1;
        throw new Error("no mail");
      },
    },
  },
}));

const LIBRARY_DEFAULT = "better-auth-secret-123456789";
const SYNTHETIC_COOKIE = "better-auth.session_token=synthetic-fixture";
const MALFORMED_COOKIE = "better-auth.session_token=%%%";

const SECRETS = [
  { id: "absent", value: undefined },
  { id: "empty", value: "" },
  { id: "whitespace", value: " \t\n " },
  { id: "library-default", value: LIBRARY_DEFAULT },
] as const;

function applySecret(value: string | undefined) {
  if (value === undefined) delete process.env.BETTER_AUTH_SECRET;
  else process.env.BETTER_AUTH_SECRET = value;
}

function cookieSummary(lines: string[]) {
  return lines.map((line) => {
    const [nv, ...attrs] = line.split(";").map((part) => part.trim());
    const eq = nv.indexOf("=");
    const name = eq < 0 ? nv : nv.slice(0, eq);
    const value = eq < 0 ? "" : nv.slice(eq + 1);
    const map: Record<string, string | true> = {};
    for (const attr of attrs) {
      const i = attr.indexOf("=");
      const key = (i < 0 ? attr : attr.slice(0, i)).toLowerCase();
      map[key] = i < 0 ? true : attr.slice(i + 1);
    }
    const expiresMs = typeof map.expires === "string" ? Date.parse(map.expires) : Number.NaN;
    const expired = map["max-age"] === "0" || (Number.isFinite(expiresMs) && expiresMs <= 1000);
    return {
      name,
      deletion: expired,
      usableAuth: value.length > 0 && !expired,
      valueLength: value.length,
      httpOnly: Object.prototype.hasOwnProperty.call(map, "httponly"),
      secure: Object.prototype.hasOwnProperty.call(map, "secure"),
      sameSite: map.samesite ?? null,
      maxAge: map["max-age"] ?? null,
      expires: typeof map.expires === "string" ? map.expires : null,
    };
  });
}

function rawSetCookie(headers: Headers): string[] {
  const read = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  if (typeof read !== "function") {
    throw new Error("Set-Cookie extraction unavailable: Headers.getSetCookie is not a function");
  }
  return read.call(headers);
}

function instrumentedCounts() {
  return {
    "totalum.crud.getRecordById": bag.getRecordById,
    "totalum.crud.query": bag.query,
    "totalum.crud.createRecord": bag.createRecord,
    "totalum.crud.updateRecordById": bag.updateRecordById,
    "totalum.crud.deleteRecordById": bag.deleteRecordById,
    "totalum.email.sendEmail": bag.sendEmail,
    "globalThis.fetch": bag.fetch,
  };
}

const DELETION_NAMES = [
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
  "better-auth.session_data",
  "__Secure-better-auth.session_data",
  "better-auth.dont_remember",
  "__Secure-better-auth.dont_remember",
  "af_ls",
  "af_so",
] as const;

async function loadApp() {
  const { middleware } = await import("@/middleware");
  const session = await import("@/lib/session");
  return { middleware, getCurrentUser: session.getCurrentUser, recentSessionDecisions: session.recentSessionDecisions, resetSession: session.__resetSessionCacheForTests };
}

async function hitImport(cookie: string | null) {
  bag.cookie = cookie;
  const { middleware, getCurrentUser, recentSessionDecisions, resetSession } = await loadApp();
  resetSession();
  const errors: unknown[][] = [];
  const previousError = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args);
  };
  const request = new NextRequest("https://aetherforgeai.co.nz/import", {
    headers: cookie ? { cookie } : {},
  });
  try {
    const mw = await middleware(request);
    const setCookie = rawSetCookie(mw.headers);
    const user = await getCurrentUser({ fresh: true });
    const decision = recentSessionDecisions().at(-1);
    return { mw, setCookie, user, decision, errors };
  } finally {
    console.error = previousError;
  }
}

describe("closed production secret, synthetic cookie, GET /import", () => {
  const prevNode = process.env.NODE_ENV;
  const prevSecret = process.env.BETTER_AUTH_SECRET;
  const evidence = path.join(tmpdir(), "import-closed-secret-evidence");

  afterEach(() => {
    process.env.NODE_ENV = prevNode;
    if (prevSecret === undefined) delete process.env.BETTER_AUTH_SECRET;
    else process.env.BETTER_AUTH_SECRET = prevSecret;
    bag.cookie = null;
    vi.unstubAllGlobals();
  });

  it("four invalid secrets: middleware 200, no Set-Cookie, closed signed-out decision", async () => {
    mkdirSync(evidence, { recursive: true });
    process.env.NODE_ENV = "production";
    vi.stubGlobal("fetch", vi.fn(async () => {
      bag.fetch += 1;
      throw new Error("network blocked");
    }));
    const sanitized = [];

    for (const secret of SECRETS) {
      applySecret(secret.value);
      const { mw, setCookie, user, decision, errors } = await hitImport(SYNTHETIC_COOKIE);
      const cookies = cookieSummary(setCookie);
      const headerText = [...mw.headers.entries()].map(([key, value]) => `${key}: ${value}`).join("\n");
      const middlewareRecord = `${mw.status}\n${headerText}\n${setCookie.join("\n")}`;
      const privateRecord = {
        secret: secret.id,
        cookieClass: "synthetic-fixture",
        status: mw.status,
        headers: headerText,
        setCookie,
        userPresent: Boolean(user),
        decision,
        unexpectedErrors: errors.length,
        instrumentedCounts: instrumentedCounts(),
        pageHtml: null,
        pageHtmlInspected: false,
        fullHtmlAcceptance: "unmet",
      };
      writeFileSync(path.join(evidence, `${secret.id}.json`), JSON.stringify(privateRecord), { mode: 0o600 });
      expect(mw.status).toBe(200);
      expect(mw.headers.get("location")).toBeNull();
      expect(mw.headers.get("cache-control")).toBe("private, no-store, no-cache, max-age=0, must-revalidate");
      expect(setCookie).toEqual([]);
      expect(user).toBeNull();
      expect(errors).toEqual([]);
      expect(decision).toMatchObject({ cookie: false, signature: false, source: "none", storeMs: null, outcome: "signed-out" });
      expect(cookies).toEqual([]);
      expect(headerText).not.toContain(SENTINEL_EMAIL);
      expect(headerText.toLowerCase()).not.toContain(LIBRARY_DEFAULT);
      sanitized.push({
        secret: secret.id,
        cookieClass: "synthetic-fixture",
        status: mw.status,
        cache: mw.headers.get("cache-control"),
        location: null,
        setCookieCount: 0,
        closedDecision: { cookie: false, signature: false, source: "none", storeMs: null, outcome: "signed-out" },
        userPresent: false,
        unexpectedErrors: 0,
        instrumentedCounts: instrumentedCounts(),
        middlewareRecordSha256: createHash("sha256").update(middlewareRecord).digest("hex"),
        middlewareRecordNote: "SHA256 of status, response header lines, and raw Set-Cookie lines. Not an HTML body hash.",
        pageHtml: null,
        pageHtmlInspected: false,
        fullHtmlAcceptance: "unmet",
      });
    }

    expect(instrumentedCounts()).toEqual({
      "totalum.crud.getRecordById": 0,
      "totalum.crud.query": 0,
      "totalum.crud.createRecord": 0,
      "totalum.crud.updateRecordById": 0,
      "totalum.crud.deleteRecordById": 0,
      "totalum.email.sendEmail": 0,
      "globalThis.fetch": 0,
    });
    writeFileSync(path.join(evidence, "sanitized.json"), JSON.stringify(sanitized, null, 2));
    expect(sanitized).toHaveLength(4);
  });

  it("absent cookie and %%% redirect to login with eight deletion cookies", async () => {
    process.env.NODE_ENV = "production";
    applySecret(undefined);
    vi.stubGlobal("fetch", vi.fn(async () => {
      bag.fetch += 1;
      throw new Error("network blocked");
    }));
    const contrast = [];
    for (const [id, cookie] of [["absent", null], ["malformed", MALFORMED_COOKIE]] as const) {
      const { mw, setCookie, user, decision, errors } = await hitImport(cookie);
      const cookies = cookieSummary(setCookie);
      expect(mw.status).toBe(307);
      expect(mw.headers.get("location")).toBe("https://aetherforgeai.co.nz/login?redirect=%2Fimport");
      expect(mw.headers.get("cache-control")).toBe("private, no-store, no-cache, max-age=0, must-revalidate");
      expect(setCookie).toHaveLength(8);
      expect(cookies.map((item) => item.name)).toEqual([...DELETION_NAMES]);
      for (const item of cookies) {
        expect(item.maxAge).toBe("0");
        expect(item.expires).toBeTruthy();
        expect(Date.parse(item.expires!)).toBeLessThanOrEqual(1000);
        expect(item.deletion).toBe(true);
        expect(item.valueLength).toBe(0);
        expect(item.httpOnly).toBe(true);
        expect(item.usableAuth).toBe(false);
      }
      expect(user).toBeNull();
      expect(errors).toEqual([]);
      expect(decision).toMatchObject({ cookie: false, signature: false, source: "none", storeMs: null, outcome: "signed-out" });
      contrast.push({
        cookieClass: id,
        status: mw.status,
        location: mw.headers.get("location"),
        cache: mw.headers.get("cache-control"),
        setCookie: cookies,
        closedDecision: { outcome: "signed-out", source: "none" },
        userPresent: false,
        instrumentedCounts: instrumentedCounts(),
      });
    }
    mkdirSync(evidence, { recursive: true });
    writeFileSync(path.join(evidence, "contrast.sanitized.json"), JSON.stringify(contrast, null, 2));
  });
});
