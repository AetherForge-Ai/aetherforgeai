import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = { grok: 0, zenith: 0 };
const mode = { value: "off" as "on" | "redacted" | "off" };
vi.mock("server-only", () => ({}));
vi.mock("@/lib/session", () => ({ getCurrentUser: async () => ({ _id: "u1", subscription_plan: "pro" }) }));
vi.mock("@/lib/ai-privacy.server", () => ({ readAiPrivacyMode: async () => mode.value }));
vi.mock("@/lib/grok", async (orig) => ({
  ...(await orig<typeof import("@/lib/grok")>()),
  createGrokChatCompletion: async () => {
    calls.grok++;
    return "ok";
  },
  createZenithCompletion: async () => {
    calls.zenith++;
    return "ok";
  },
}));
vi.mock("@/lib/totalum", () => ({
  totalumSdk: {
    crud: {
      query: async () => ({ data: [{ ticker: "FPH", shares: 40, purchase_price: 25, current_price: 33.1, sector: "Health" }] }),
      createRecord: async () => ({ data: {} }),
    },
  },
}));

describe("G-26 network check: AI off makes no provider call", () => {
  beforeEach(() => {
    calls.grok = 0;
    calls.zenith = 0;
  });
  it("/api/analysis", async () => {
    const { POST } = await import("@/app/api/analysis/route");
    mode.value = "off";
    const off = await (await POST()).json();
    expect(off.data.aiOff).toBe(true);
    expect(calls.zenith).toBe(0);
    mode.value = "on";
    await POST();
    expect(calls.zenith).toBe(1);
  });
  it("/api/ticker-analysis", async () => {
    const { POST } = await import("@/app/api/ticker-analysis/route");
    mode.value = "off";
    const res = await POST(new Request("http://x/api/ticker-analysis", { method: "POST", body: JSON.stringify({ symbol: "FPH.NZ" }) }));
    const j = await res.json();
    expect(j.data.aiOff).toBe(true);
    expect(calls.grok).toBe(0);
  });
});
