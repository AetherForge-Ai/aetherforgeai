/**
 * HOOKS-PROD-OFF: GOAL_TEST_HOOKS is fail-closed. A production release marker
 * stays off even when the string "1" was baked in at build time.
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/session", () => ({ getTradeSessionUser: vi.fn(async () => null), getCurrentUser: vi.fn(async () => null) }));
vi.mock("@/lib/totalum", () => ({ totalumSdk: { crud: { query: vi.fn(async () => ({ data: [] })) } } }));
vi.mock("@/lib/transactions", () => ({ applyTransaction: vi.fn() }));
vi.mock("@/lib/book-cache", () => ({ invalidateBookCache: vi.fn() }));

import { GET as seedGet } from "@/app/api/test-hooks/seed-overseas/route";
import { GET as aiGet } from "@/app/api/test-hooks/ai-working/route";
import { BUILD_RELEASE_ID, goalTestHooksOn, isProductionRelease } from "@/lib/goal-test-hooks";
import { testHooksAllowedFor, testHooksEnabled } from "@/lib/test-hooks";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("HOOKS-PROD-OFF", () => {
  it("pins the release marker to public/build-version.txt and does not bump it", () => {
    expect(BUILD_RELEASE_ID).toBe(readFileSync("public/build-version.txt", "utf8").trim());
    expect(BUILD_RELEASE_ID).toBe("v3-b103-2026-11-15");
    expect(isProductionRelease(BUILD_RELEASE_ID)).toBe(true);
    expect(isProductionRelease("")).toBe(false);
    expect(isProductionRelease("preview")).toBe(false);
  });

  it("unset is off, and true/yes are off; only the exact string 1 counts", () => {
    expect(goalTestHooksOn({}, "")).toBe(false);
    expect(goalTestHooksOn({ GOAL_TEST_HOOKS: undefined }, "")).toBe(false);
    expect(goalTestHooksOn({ GOAL_TEST_HOOKS: "" }, "")).toBe(false);
    expect(goalTestHooksOn({ GOAL_TEST_HOOKS: "true" }, "")).toBe(false);
    expect(goalTestHooksOn({ GOAL_TEST_HOOKS: "yes" }, "")).toBe(false);
    expect(goalTestHooksOn({ GOAL_TEST_HOOKS: "0" }, "")).toBe(false);
    expect(goalTestHooksOn({ GOAL_TEST_HOOKS: "1" }, "")).toBe(true);
    expect(testHooksAllowedFor({ _id: "u1" }, { GOAL_TEST_HOOKS: "true", GOAL_TEST_HOOK_USER_IDS: "u1" })).toBe(false);
    expect(testHooksAllowedFor({ _id: "u1" }, { GOAL_TEST_HOOKS: "yes", GOAL_TEST_HOOK_USER_IDS: "u1" })).toBe(false);
    expect(testHooksAllowedFor({ _id: "u1" }, { GOAL_TEST_HOOKS: "1", GOAL_TEST_HOOK_USER_IDS: "u1" })).toBe(true);
    expect(testHooksEnabled({ GOAL_TEST_HOOKS: "1" }, "")).toBe(true);
    expect(testHooksEnabled({ GOAL_TEST_HOOKS: "true" }, "")).toBe(false);
  });

  it("a production release build is off even when GOAL_TEST_HOOKS is exactly 1", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("GOAL_TEST_HOOKS", "1");
    vi.stubEnv("GOAL_TEST_HOOK_USER_IDS", "u1");
    expect(goalTestHooksOn()).toBe(false);
    expect(testHooksEnabled()).toBe(false);
    expect(testHooksAllowedFor({ _id: "u1" })).toBe(false);
    expect(goalTestHooksOn({ GOAL_TEST_HOOKS: "1", NODE_ENV: "production" }, BUILD_RELEASE_ID)).toBe(false);
    expect(goalTestHooksOn({ GOAL_TEST_HOOKS: "1", NODE_ENV: "production" }, "preview")).toBe(true);
  });

  it("GET /api/test-hooks/seed-overseas is 404 when hooks are off, not 405", async () => {
    vi.stubEnv("GOAL_TEST_HOOKS", "");
    const unset = await seedGet();
    expect(unset.status).toBe(404);
    vi.stubEnv("GOAL_TEST_HOOKS", "true");
    expect((await seedGet()).status).toBe(404);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("GOAL_TEST_HOOKS", "1");
    expect((await seedGet()).status).toBe(404);
    expect((await aiGet()).status).toBe(404);
    const text = JSON.stringify(await (await seedGet()).json());
    expect(text).not.toContain("GOAL_TEST_HOOK_USER_IDS");
  });
});
