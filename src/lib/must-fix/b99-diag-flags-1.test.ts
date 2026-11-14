/**
 * DIAG-FLAGS-1: /api/health reports flag booleans (edge snapshot + runtime),
 * and signed-out /shared is 404 when both PORTFOLIO_SHARING readings are off.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { GET as healthGet } from "@/app/api/health/route";
import {
  DIAG_FLAG_NAMES,
  EDGE_FLAGS_HEADER,
  decodeEdgeFlags,
  edgeFlagState,
  encodeEdgeFlags,
  healthFlags,
  runtimeFlagState,
} from "@/lib/diag-flags";
import { sharedRouteGate, signedOutSharedMissing } from "@/lib/route-gate";
import { decideSharedPage } from "@/lib/shared-access";
import { middleware } from "@/middleware";

const read = (p: string) => readFileSync(p, "utf8");
const SECRET_IDS = "zz-hook-user-9f3a,zz-hook-user-1c2d";
const SECRET_PRICE = "price-token-should-not-leak";
const SECRET_OTHER = "raw-env-should-not-leak";

afterEach(() => {
  vi.unstubAllEnvs();
});

function stubFlags(extra: Record<string, string> = {}) {
  vi.stubEnv("GOAL_TEST_HOOKS", "");
  vi.stubEnv("PORTFOLIO_SHARING", "");
  vi.stubEnv("HEADMASTER_GOALS", "");
  vi.stubEnv("NEW_PRICE_STRUCTURE", "");
  vi.stubEnv("AI_SHOW_WORKING", "");
  vi.stubEnv("GOAL_TEST_HOOK_USER_IDS", SECRET_IDS);
  for (const [key, value] of Object.entries(extra)) vi.stubEnv(key, value);
}

function headerBag(res: Response): string {
  return [...res.headers.entries()].map(([key, value]) => `${key}:${value}`).join("\n");
}

describe("DIAG-FLAGS-1 /api/health", () => {
  it("returns 200 JSON with runtime and edge booleans and Cache-Control: no-store", async () => {
    stubFlags({
      PORTFOLIO_SHARING: "on",
      AI_SHOW_WORKING: "1",
      NEW_PRICE_STRUCTURE: "1",
      HEADMASTER_GOALS: "yes",
      GOAL_TEST_HOOKS: "true",
    });
    const edge = "GOAL_TEST_HOOKS=1,PORTFOLIO_SHARING=0,HEADMASTER_GOALS=1,NEW_PRICE_STRUCTURE=0,AI_SHOW_WORKING=0";
    const res = await healthGet(
      new NextRequest("https://aetherforgeai.co.nz/api/health", {
        headers: { [EDGE_FLAGS_HEADER]: `${edge},NOTE=${SECRET_OTHER}` },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).toEqual({
      flags: {
        GOAL_TEST_HOOKS: { runtime: false, edge: true },
        PORTFOLIO_SHARING: { runtime: true, edge: false },
        HEADMASTER_GOALS: { runtime: false, edge: true },
        NEW_PRICE_STRUCTURE: { runtime: true, edge: false },
        AI_SHOW_WORKING: { runtime: true, edge: false },
      },
    });
    for (const name of DIAG_FLAG_NAMES) {
      expect(Object.keys(body.flags[name]).sort()).toEqual(["edge", "runtime"]);
      expect(typeof body.flags[name].runtime).toBe("boolean");
      expect(typeof body.flags[name].edge).toBe("boolean");
    }
    expect(body.count).toBeUndefined();
    expect(body.flags.GOAL_TEST_HOOK_USER_IDS).toBeUndefined();
  });

  it("never echoes a raw env string, the allow-list, or a count", async () => {
    stubFlags({
      GOAL_TEST_HOOKS: "1",
      PORTFOLIO_SHARING: "ON",
      HEADMASTER_GOALS: SECRET_OTHER,
      NEW_PRICE_STRUCTURE: SECRET_PRICE,
      AI_SHOW_WORKING: "1",
    });
    const poisoned = `GOAL_TEST_HOOKS=${SECRET_IDS},PORTFOLIO_SHARING=${SECRET_PRICE},HEADMASTER_GOALS=on,NEW_PRICE_STRUCTURE=1,AI_SHOW_WORKING=0`;
    const res = await healthGet(
      new NextRequest("https://aetherforgeai.co.nz/api/health", {
        headers: { [EDGE_FLAGS_HEADER]: poisoned },
      }),
    );
    const text = `${JSON.stringify(await res.json())}\n${headerBag(res)}`;
    expect(text).not.toContain(SECRET_IDS);
    expect(text).not.toContain("zz-hook-user-9f3a");
    expect(text).not.toContain("zz-hook-user-1c2d");
    expect(text).not.toContain(SECRET_PRICE);
    expect(text).not.toContain(SECRET_OTHER);
    expect(text).not.toContain("ON");
    expect(text).not.toMatch(/"count"\s*:/);
    expect(text).not.toContain("GOAL_TEST_HOOK_USER_IDS");
    // A non 0/1 edge token is ignored, not copied. NEW_PRICE_STRUCTURE=1 is the only edge bit on.
    expect(decodeEdgeFlags(poisoned).NEW_PRICE_STRUCTURE).toBe(true);
    expect(decodeEdgeFlags(poisoned).PORTFOLIO_SHARING).toBe(false);
    expect(healthFlags(poisoned).PORTFOLIO_SHARING).toEqual({ runtime: true, edge: false });
  });

  it("middleware sets x-af-edge-flags on /api/health only, as 0/1 pairs", async () => {
    stubFlags({ GOAL_TEST_HOOKS: "1", PORTFOLIO_SHARING: "on", AI_SHOW_WORKING: "1" });
    const health = await middleware(new NextRequest("https://aetherforgeai.co.nz/api/health"));
    const expected = encodeEdgeFlags(edgeFlagState());
    expect(expected).toBe(
      "GOAL_TEST_HOOKS=1,PORTFOLIO_SHARING=1,HEADMASTER_GOALS=0,NEW_PRICE_STRUCTURE=0,AI_SHOW_WORKING=1",
    );
    expect(health.headers.get(EDGE_FLAGS_HEADER)).toBe(expected);
    expect(health.headers.get("x-middleware-request-x-af-edge-flags")).toBe(expected);
    expect(health.headers.get("cache-control")).toContain("no-store");
    expect(headerBag(health)).not.toContain(SECRET_IDS);
    expect(runtimeFlagState().PORTFOLIO_SHARING).toBe(true);
    expect(runtimeFlagState().HEADMASTER_GOALS).toBe(false);

    const forwarded = health.headers.get(EDGE_FLAGS_HEADER);
    const route = await healthGet(
      new NextRequest("https://aetherforgeai.co.nz/api/health", {
        headers: { [EDGE_FLAGS_HEADER]: forwarded ?? "" },
      }),
    );
    const body = await route.json();
    expect(body.flags.PORTFOLIO_SHARING).toEqual({ runtime: true, edge: true });
    expect(body.flags.GOAL_TEST_HOOKS).toEqual({ runtime: true, edge: true });
    expect(body.flags.AI_SHOW_WORKING).toEqual({ runtime: true, edge: true });
    expect(body.flags.HEADMASTER_GOALS).toEqual({ runtime: false, edge: false });

    for (const path of ["/pricing", "/shared", "/api/healthz", "/health", "/api/version"]) {
      const res = await middleware(new NextRequest(`https://aetherforgeai.co.nz${path}`));
      expect(res.headers.get(EDGE_FLAGS_HEADER), path).toBeNull();
      expect(res.headers.get("x-middleware-request-x-af-edge-flags"), path).toBeNull();
    }
  });
});

describe("DIAG-FLAGS-1 signed-out /shared", () => {
  it("is 404 when both PORTFOLIO_SHARING flags are off, including while test hooks are on", async () => {
    stubFlags({ GOAL_TEST_HOOKS: "1" });
    expect(edgeFlagState().PORTFOLIO_SHARING).toBe(false);
    expect(runtimeFlagState().PORTFOLIO_SHARING).toBe(false);
    expect(signedOutSharedMissing("/shared", false, false)).toBe(true);
    expect(signedOutSharedMissing("/shared", true, false)).toBe(false);
    expect(signedOutSharedMissing("/shared", false, true)).toBe(false);
    expect(sharedRouteGate({ signedIn: false, edgeOn: false, runtimeOn: false, allowListed: false })).toBe("not-found");
    expect(sharedRouteGate({ signedIn: true, edgeOn: false, runtimeOn: false, allowListed: false })).toBe("not-found");
    expect(sharedRouteGate({ signedIn: true, edgeOn: false, runtimeOn: false, allowListed: true })).toBe("ok");
    expect(sharedRouteGate({ signedIn: false, edgeOn: false, runtimeOn: true, allowListed: false })).toBe("login");

    for (const path of ["/shared", "/shared/"]) {
      const res = await middleware(new NextRequest(`https://aetherforgeai.co.nz${path}`));
      expect(res.status, path).not.toBe(307);
      expect(res.headers.get("location"), path).toBeNull();
      expect(res.headers.get("x-middleware-rewrite"), path).toContain("/__missing");
    }

    const page = read("src/app/shared/page.tsx");
    expect(page.indexOf("decideSharedPage(")).toBeLessThan(page.indexOf('redirect("/login?redirect=/shared")'));
    expect(page.indexOf("notFound()")).toBeLessThan(page.indexOf('redirect("/login?redirect=/shared")'));
    expect(decideSharedPage(null)).toBe("not-found");
    expect(decideSharedPage({ _id: "member-9" })).toBe("not-found");
    expect(
      decideSharedPage(
        { _id: "tt-1" },
        { env: { GOAL_TEST_HOOKS: "1", GOAL_TEST_HOOK_USER_IDS: "tt-1", PORTFOLIO_SHARING: "" }, edgeOn: false, runtimeOn: false },
      ),
    ).toBe("ok");
  });

  it("still sends signed-out /shared to login when PORTFOLIO_SHARING is on", async () => {
    stubFlags({ PORTFOLIO_SHARING: "on", GOAL_TEST_HOOKS: "1" });
    const res = await middleware(new NextRequest("https://aetherforgeai.co.nz/shared"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://aetherforgeai.co.nz/login?redirect=%2Fshared");
  });

  it("lets a signed-in request through when hooks are on and sharing is off, so the page can decide", async () => {
    stubFlags({ GOAL_TEST_HOOKS: "1" });
    const res = await middleware(
      new NextRequest("https://aetherforgeai.co.nz/shared", {
        headers: { cookie: "__Secure-better-auth.session_token=signed-in-token" },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
  });
});
