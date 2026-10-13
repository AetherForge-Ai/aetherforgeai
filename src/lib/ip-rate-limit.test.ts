import { afterEach, describe, expect, it } from "vitest";
import {
  NO_CF_IP,
  RATE_WINDOW_MS,
  rateLimitIdentity,
  rateLimitStorageKey,
  resetRateLimits,
  takeRateLimit,
} from "@/lib/ip-rate-limit";

const store = new Map<string, string>();

function installCache() {
  (globalThis as { caches?: unknown }).caches = {
    default: {
      async match(request: Request) {
        const body = store.get(request.url);
        return body == null ? undefined : new Response(body);
      },
      async put(request: Request, response: Response) {
        store.set(request.url, await response.text());
      },
    },
  };
}

afterEach(() => {
  resetRateLimits();
  store.clear();
  delete (globalThis as { caches?: unknown }).caches;
});

function request(headers: Record<string, string>) {
  return new Request("https://aetherforgeai.co.nz/api/personal-guide", { headers });
}

describe("public post rate limit", () => {
  it("does not reset the limit when X-Forwarded-For changes", async () => {
    const first = request({
      "cf-connecting-ip": "203.0.113.8",
      "x-forwarded-for": "1.1.1.1",
    });
    const rotated = request({
      "cf-connecting-ip": "203.0.113.8",
      "x-forwarded-for": "8.8.8.8",
    });
    expect(rateLimitIdentity(first).ok && rateLimitIdentity(first).ip).toBe("203.0.113.8");
    expect(rateLimitIdentity(rotated).ok && rateLimitIdentity(rotated).ip).toBe("203.0.113.8");
    const key = "personal-guide:203.0.113.8";
    expect((await takeRateLimit(key, 1, RATE_WINDOW_MS, 5_000)).allowed).toBe(true);
    expect((await takeRateLimit(key, 1, RATE_WINDOW_MS, 5_000)).allowed).toBe(false);

    const spoofed = request({ "x-forwarded-for": "9.9.9.9" });
    const again = request({ "x-forwarded-for": "4.4.4.4" });
    const missing = rateLimitIdentity(spoofed, "test");
    const missingAgain = rateLimitIdentity(again, "test");
    expect(missing).toEqual({ ok: true, ip: NO_CF_IP });
    expect(missingAgain).toEqual({ ok: true, ip: NO_CF_IP });
    const shared = `personal-guide:${NO_CF_IP}`;
    expect((await takeRateLimit(shared, 1, RATE_WINDOW_MS, 5_000)).allowed).toBe(true);
    expect((await takeRateLimit(shared, 1, RATE_WINDOW_MS, 5_000)).allowed).toBe(false);
    expect(rateLimitIdentity(spoofed, "production")).toEqual({ ok: false });
  });

  it("keeps the count in the shared cache after the isolate map is cleared", async () => {
    installCache();
    const key = "contact:203.0.113.9";
    const now = 5_000;
    expect(rateLimitStorageKey(key, RATE_WINDOW_MS, now)).toBe(`rl:${key}:0`);
    expect((await takeRateLimit(key, 1, RATE_WINDOW_MS, now)).allowed).toBe(true);
    resetRateLimits();
    expect((await takeRateLimit(key, 1, RATE_WINDOW_MS, now)).allowed).toBe(false);
    expect(store.size).toBeGreaterThan(0);
  });
});
