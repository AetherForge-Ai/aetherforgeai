/** b28 CR-2 / L-4: hits the real signed-in Assistant route handlers. */
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

const rows: { role: string; content: string; user: string; createdAt: string }[] = [];
const grok = vi.fn(async () => "model reply");
const user = { _id: "u1", subscription_plan: "starter_monthly", email: "t@example.com" };

vi.mock("@/lib/session", async (orig) => ({ ...(await orig<typeof import("@/lib/session")>()), getCurrentUser: vi.fn(async () => user) }));
vi.mock("@/lib/totalum", () => ({
  totalumSdk: {
    crud: {
      query: vi.fn(async (table: string) => (table === "chat_message" ? { data: [...rows].reverse() } : { data: [] })),
      createRecord: vi.fn(async (table: string, rec: { role: string; content: string; user: string }) => {
        if (table === "chat_message") rows.push({ ...rec, createdAt: new Date().toISOString() });
        return { data: rec };
      }),
    },
  },
}));
vi.mock("@/lib/grok", async (orig) => ({ ...(await orig<typeof import("@/lib/grok")>()), isGrokConfigured: () => true, createGrokChatCompletion: grok }));
vi.mock("@/lib/totalum-service", () => ({ loadTotalumSynthesis: vi.fn(async () => null), loadReportFindings: vi.fn(async () => []) }));

const QUESTIONS = [
  "Which NZX share should I buy?",
  "Best NZX shares right now?",
  "Should I sell FPH?",
  "Give me a share tip",
  "Should I buy Fisher & Paykel Healthcare (FPH.NZ) shares now?",
];

const post = (url: string, message: string) =>
  new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message }) });

describe("signed-in Assistant panel /api/portfolio-coach", () => {
  beforeEach(() => {
    rows.length = 0;
    grok.mockClear();
  });
  it.each(QUESTIONS)("refuses %s with the disclaimer and no model call", async (q) => {
    const { POST } = await import("./route");
    const res = await POST(post("http://x/api/portfolio-coach", q));
    const body = (await res.json()) as { ok: boolean; data: { reply: string; refused?: string; used: number; limit: number } };
    expect(body.ok).toBe(true);
    expect(body.data.refused).toBe("personalised_advice");
    expect(body.data.reply).toContain("can't pick NZX or other shares");
    expect(body.data.reply).toContain("General information, not financial advice.");
    expect(body.data.reply).not.toMatch(/open an account|broker app|how to buy/i);
    expect(grok).not.toHaveBeenCalled();
  });
  it("counts every answered question, refusals included", async () => {
    const { POST } = await import("./route");
    const a = (await (await POST(post("http://x/api/portfolio-coach", "What does FIF mean?"))).json()) as { data: { used: number; limit: number } };
    await new Promise((r) => setTimeout(r, 0));
    const b = (await (await POST(post("http://x/api/portfolio-coach", QUESTIONS[0]))).json()) as { data: { used: number; limit: number } };
    expect(a.data).toMatchObject({ used: 1, limit: 100 });
    // b32 CR-2: the refusal answers on the static path; it is still counted, in the background.
    expect(b.data).toMatchObject({ refused: "personalised_advice" });
    await new Promise((r) => setTimeout(r, 10));
    const again = (await (await POST(post("http://x/api/portfolio-coach", "What does FIF mean?"))).json()) as { data: { used: number } };
    expect(again.data.used).toBe(3);
    expect(grok).toHaveBeenCalledTimes(2);
  });
});

describe("/api/chat", () => {
  it("refuses FPH with no model call and returns used+1", async () => {
    rows.length = 0;
    grok.mockClear();
    const { POST } = await import("../chat/route");
    const body = (await (await POST(post("http://x/api/chat", QUESTIONS[4]))).json()) as { data: { reply: string; used: number } };
    expect(body.data.reply).toContain("General information, not financial advice.");
    expect(body.data.used).toBe(1);
    expect(grok).not.toHaveBeenCalled();
  });
});
