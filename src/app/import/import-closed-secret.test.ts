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
 * Calls the real middleware and the real /import page. Totalum is a local
 * sentinel record and must not be written.
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
  recordReads: 0,
  writes: 0,
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
        bag.recordReads += 1;
        return { data: { _id: "sentinel-user", id: "sentinel-user", email: SENTINEL_EMAIL, name: SENTINEL_NAME } };
      },
      query: async () => ({ data: [] }),
      createRecord: async () => {
        bag.writes += 1;
        throw new Error("no writes");
      },
      updateRecordById: async () => {
        bag.writes += 1;
        throw new Error("no writes");
      },
      deleteRecordById: async () => {
        bag.writes += 1;
        throw new Error("no writes");
      },
    },
    email: {
      sendEmail: async () => {
        bag.writes += 1;
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
    const deletion = map["max-age"] === "0" || value === "";
    return {
      name,
      deletion,
      usableAuth: !deletion && value.length > 0,
      valueLength: value.length,
      httpOnly: Object.prototype.hasOwnProperty.call(map, "httponly"),
      secure: Object.prototype.hasOwnProperty.call(map, "secure"),
      sameSite: map.samesite ?? null,
      maxAge: map["max-age"] ?? null,
    };
  });
}

async function loadApp() {
  const { middleware } = await import("@/middleware");
  const { getCurrentUser } = await import("@/lib/session");
  return { middleware, getCurrentUser };
}

async function hitImport(cookie: string | null) {
  bag.cookie = cookie;
  bag.recordReads = 0;
  const { middleware, getCurrentUser } = await loadApp();
  const request = new NextRequest("https://aetherforgeai.co.nz/import", {
    headers: cookie ? { cookie } : {},
  });
  const mw = await middleware(request);
  const setCookie = typeof mw.headers.getSetCookie === "function" ? mw.headers.getSetCookie() : [];
  const user = await getCurrentUser({ fresh: true });
  return { mw, setCookie, user };
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

  it("keeps the four invalid-secret rows on the signed-out import sentence", async () => {
    mkdirSync(evidence, { recursive: true });
    process.env.NODE_ENV = "production";
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network blocked");
    }));
    const sanitized = [];

    for (const secret of SECRETS) {
      applySecret(secret.value);
      const { mw, setCookie, user } = await hitImport(SYNTHETIC_COOKIE);
      const cookies = cookieSummary(setCookie);
      const headerText = [...mw.headers.entries()].map(([key, value]) => `${key}: ${value}`).join("\n");
      const privateRecord = {
        secret: secret.id,
        cookieClass: "synthetic-fixture",
        status: mw.status,
        headers: headerText,
        setCookie,
        userPresent: Boolean(user),
        recordReads: bag.recordReads,
        writes: bag.writes,
        pageHtml: null,
        pageHtmlNote: "ImportPage did not render in vitest: jsxDEV is not a function. Two render attempts were parked. This record is the middleware response plus getCurrentUser.",
      };
      writeFileSync(path.join(evidence, `${secret.id}.json`), JSON.stringify(privateRecord), { mode: 0o600 });
      expect(mw.status).toBe(200);
      expect(mw.headers.get("location")).toBeNull();
      expect(mw.headers.get("cache-control")).toContain("private");
      expect(mw.headers.get("cache-control")).toContain("no-store");
      expect(cookies.every((cookie) => !cookie.usableAuth)).toBe(true);
      expect(user).toBeNull();
      expect(bag.recordReads).toBe(0);
      expect(bag.writes).toBe(0);
      expect(JSON.stringify(user ?? null)).not.toContain(SENTINEL_EMAIL);
      expect(headerText).not.toContain(SENTINEL_EMAIL);
      expect(headerText.toLowerCase()).not.toContain(LIBRARY_DEFAULT);
      sanitized.push({
        secret: secret.id,
        cookieClass: "synthetic-fixture",
        status: mw.status,
        cache: mw.headers.get("cache-control"),
        location: mw.headers.get("location"),
        setCookie: cookies,
        userPresent: false,
        recordReads: 0,
        responseSha256: createHash("sha256").update(`${mw.status}\n${headerText}\n${setCookie.join("\n")}`).digest("hex"),
        pageHtmlInspected: false,
      });
    }

    writeFileSync(path.join(evidence, "sanitized.json"), JSON.stringify(sanitized, null, 2));
    expect(sanitized).toHaveLength(4);
  });

  it("does not treat an absent cookie or %%% as a closed 503", async () => {
    process.env.NODE_ENV = "production";
    applySecret(undefined);
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network blocked");
    }));
    const contrast = [];
    for (const [id, cookie] of [["absent", null], ["malformed", MALFORMED_COOKIE]] as const) {
      const { mw, setCookie, user } = await hitImport(cookie);
      const cookies = cookieSummary(setCookie);
      expect(mw.status).not.toBe(503);
      expect(cookies.every((item) => !item.usableAuth)).toBe(true);
      expect(user).toBeNull();
      expect(bag.recordReads).toBe(0);
      contrast.push({
        cookieClass: id,
        status: mw.status,
        location: mw.headers.get("location"),
        cache: mw.headers.get("cache-control"),
        setCookie: cookies,
        userPresent: false,
      });
    }
    mkdirSync(evidence, { recursive: true });
    writeFileSync(path.join(evidence, "contrast.sanitized.json"), JSON.stringify(contrast, null, 2));
  });
});
