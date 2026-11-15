/** AI-CHAT-SIGNALS-1: Market Assistant answers from the bots' existing picks. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("server-only", () => ({}));

const grok = vi.fn(async () => "FPH.NZ is the strongest Buy in the feed.");
const chat: { role: string; content: string; user: string; createdAt: string }[] = [];
let reports: Record<string, unknown>[] = [];
const user = {
  _id: "u1",
  subscription_plan: "pro_monthly",
  bot_access: "both",
  email: "t@example.com",
  name: "Member",
};

vi.mock("@/lib/session", async (orig) => ({
  ...(await orig<typeof import("@/lib/session")>()),
  getCurrentUser: vi.fn(async () => user),
}));
vi.mock("@/lib/totalum", () => ({
  totalumSdk: {
    crud: {
      query: vi.fn(async (table: string) => {
        if (table === "report") return { data: reports };
        if (table === "chat_message") return { data: [...chat].reverse() };
        return { data: [] };
      }),
      createRecord: vi.fn(async (_table: string, rec: { role: string; content: string; user: string }) => {
        if (rec.role) chat.push({ ...rec, createdAt: new Date().toISOString() });
        return { data: rec };
      }),
    },
  },
}));
vi.mock("@/lib/grok", async (orig) => ({
  ...(await orig<typeof import("@/lib/grok")>()),
  isGrokConfigured: () => true,
  createGrokChatCompletion: grok,
}));

import { GUIDE_REPLY_DISCLAIMER, withAssistantDisclaimer } from "@/lib/guide-safety";
import { ANALYST_SYSTEM_PROMPT } from "@/lib/ai-context";
import {
  allowedSignalBots,
  buildSignalFeed,
  filterSignalRows,
  isRecommendationSignalQuestion,
  prepareRecommendationAnswer,
  rankSignalRows,
  recommendationSignalMessages,
  RECOMMENDATION_SIGNAL_RULES,
  signalRowFromPick,
  type ChatSignalRow,
  type SignalFeed,
} from "@/lib/chat-signals";

const read = (p: string) => readFileSync(p, "utf8");
const NOW = new Date("2026-11-15T00:00:00.000Z");
const FRESH = "2026-11-14T01:00:00.000Z";
const call = (lo: number, hi: number) =>
  ({ horizon: "7-day", range: "", oddsPct: 60, killPrice: 1, realizedVolPct: 10, bear: [1, 2], base: [lo, hi], bull: [3, 4] }) as const;

function row(over: Partial<ChatSignalRow> = {}): ChatSignalRow {
  return {
    ticker: "FPH.NZ",
    name: "Fisher & Paykel Healthcare",
    label: "Buy",
    price: 36.8,
    predictedPrice: 39,
    currency: "NZD",
    exchange: "NZX",
    platforms: [],
    asOf: FRESH,
    score: 70,
    projected7dPct: 6,
    confidence: 60,
    ...over,
  };
}

function feed(rows: ChatSignalRow[], over: Partial<SignalFeed> = {}): SignalFeed {
  return { status: "ok", asOf: FRESH, platformCoverage: "exchange-only", rows, ...over };
}

const post = (message: string) =>
  new Request("http://x/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message }),
  });

describe("AI-CHAT-SIGNALS-1 filters and labels", () => {
  it("a Sharesies filter returns only the rows available there", () => {
    const rows = [
      row({ ticker: "FPH.NZ", platforms: ["Sharesies", "Stake"] }),
      row({ ticker: "BHP.AX", name: "BHP", exchange: "ASX", currency: "AUD", platforms: ["Stake"] }),
      row({ ticker: "AAPL", name: "Apple", exchange: "US", currency: "USD", platforms: ["Hatch", "IBKR"] }),
      row({ ticker: "AIR.NZ", name: "Air New Zealand", platforms: [] }),
    ];
    const sharesies = filterSignalRows(rows, { platform: "Sharesies" });
    expect(sharesies.map((r) => r.ticker)).toEqual(["FPH.NZ"]);
    expect(sharesies.every((r) => r.platforms.some((p) => p.toLowerCase() === "sharesies"))).toBe(true);
  });

  it("uses the bot direction label: Buy above the price, Sell below, no label without a prediction", () => {
    const buy = signalRowFromPick(
      { ticker: "FPH.NZ", name: "Fisher & Paykel Healthcare", price: 36.8, signal: "Strong Buy", sentiment: 80, call: call(38, 40) },
      FRESH,
      "stock"
    );
    const sell = signalRowFromPick(
      { ticker: "AIR.NZ", name: "Air New Zealand", price: 1, signal: "Sell", sentiment: 20, call: call(0.8, 0.9) },
      FRESH,
      "stock"
    );
    const none = signalRowFromPick({ ticker: "MEL.NZ", name: "Meridian", price: 6, sentiment: 90 }, FRESH, "stock");
    expect(buy).toMatchObject({ label: "Strong Buy", currency: "NZD", exchange: "NZX", platforms: [] });
    expect(buy!.predictedPrice).toBe(39);
    expect(sell).toMatchObject({ label: "Sell", exchange: "NZX" });
    expect(none).toBeNull();
    expect(signalRowFromPick({ ticker: "BTC", name: "Bitcoin", price: 100, call: call(110, 120) }, FRESH, "crypto")).toBeNull();
  });

  it("ranks buys by the existing strength and keeps sells at the other end", () => {
    const weak = row({ ticker: "AAA.NZ", projected7dPct: 1, score: 90, confidence: 100 });
    const strong = row({ ticker: "BBB.NZ", projected7dPct: 8, score: 40, confidence: 100 });
    expect(rankSignalRows([weak, strong], "buy").map((r) => r.ticker)).toEqual(["BBB.NZ", "AAA.NZ"]);
    expect(rankSignalRows([weak, strong], "sell").map((r) => r.ticker)).toEqual(["AAA.NZ", "BBB.NZ"]);
  });

  it("the tool output contains only the real matching rows", () => {
    const rows = [
      row({ ticker: "FPH.NZ", label: "Strong Buy", platforms: ["Sharesies"] }),
      row({ ticker: "AIR.NZ", name: "Air New Zealand", label: "Sell", predictedPrice: 0.85, projected7dPct: -4, score: 20 }),
    ];
    const prepared = prepareRecommendationAnswer("What's the best buy today on NZX?", feed(rows, { platformCoverage: "listed" }));
    expect(prepared.mode).toBe("answer");
    expect(prepared.rows.map((r) => r.ticker)).toEqual(["FPH.NZ"]);
    const tool = JSON.parse(prepared.toolText) as { rows: { ticker: string; label: string; platforms: string[] }[] };
    expect(tool.rows.map((r) => r.ticker)).toEqual(["FPH.NZ"]);
    expect(prepared.toolText).not.toContain("AIR.NZ");
    expect(prepared.toolText).not.toContain("ZZZ");
    expect(prepared.text).toContain("FPH.NZ");
    expect(prepared.text).not.toContain("AIR.NZ");
    expect(prepared.text).toMatch(/As of /);
  });

  it("an empty or stale feed produces an unavailable answer and names no ticker", () => {
    const empty = prepareRecommendationAnswer("What's the best buy today on NZX?", {
      status: "empty",
      asOf: null,
      platformCoverage: "exchange-only",
      rows: [],
    });
    expect(empty.mode).toBe("unavailable");
    expect(empty.text).toContain("Current recommendation signals aren't available.");
    expect(empty.text).toContain("no as-of time");
    expect(empty.text).not.toMatch(/\b[A-Z]{2,5}\.(NZ|AX)\b/);

    const stale = buildSignalFeed(
      [
        {
          bot: "stock",
          generatedAt: "2026-10-01T00:00:00.000Z",
          payload: {
            tickers: [{ ticker: "FPH.NZ", name: "Fisher & Paykel Healthcare", price: 36.8, signal: "Buy", call: call(38, 40) }],
          },
        },
      ],
      NOW
    );
    expect(stale.status).toBe("stale");
    const answer = prepareRecommendationAnswer("What's the best buy today on NZX?", stale);
    expect(answer.mode).toBe("unavailable");
    expect(answer.text).toContain("Current recommendation signals aren't available.");
    expect(answer.text).toContain("As of");
    expect(answer.text).not.toContain("FPH.NZ");
    expect(answer.rows).toEqual([]);

    const failed = prepareRecommendationAnswer("any strong sells?", {
      status: "failed",
      asOf: null,
      platformCoverage: "exchange-only",
      rows: [row()],
    });
    expect(failed.text).toContain("could not be read");
    expect(failed.text).not.toContain("FPH.NZ");
  });

  it("Sharesies is not invented when the feed only has the exchange", () => {
    const prepared = prepareRecommendationAnswer("What's the best buy today on Sharesies?", feed([row()]));
    expect(prepared.mode).toBe("unavailable");
    expect(prepared.text).toContain("Sharesies is not in this feed");
    expect(prepared.text).toContain("exchange only");
    expect(prepared.text).not.toContain("FPH.NZ");
    expect(prepared.text).toMatch(/As of /);
  });

  it("crypto stays on the existing pause, and bot access still gates the bots", () => {
    expect(isRecommendationSignalQuestion("What's the best buy today on crypto?")).toBe(true);
    const paused = prepareRecommendationAnswer("best buy on crypto", feed([row()]));
    expect(paused.text).toContain("Crypto projections are paused");
    expect(paused.text).not.toContain("FPH.NZ");
    expect(allowedSignalBots("stock", true)).toEqual(["stock"]);
    expect(allowedSignalBots("none", true)).toEqual([]);
    expect(allowedSignalBots(undefined, false)).toEqual(["stock", "crypto"]);
    const locked = prepareRecommendationAnswer("What's the best buy today on NZX?", {
      status: "not_entitled",
      asOf: null,
      platformCoverage: "exchange-only",
      rows: [row()],
    });
    expect(locked.text).toContain("not included on this plan");
    expect(locked.text).not.toContain("FPH.NZ");
  });

  it("puts the disclaimer on a recommendation answer", () => {
    const prepared = prepareRecommendationAnswer("any strong sells?", feed([row({ ticker: "AIR.NZ", label: "Sell", projected7dPct: -3 })]));
    const reply = withAssistantDisclaimer(prepared.text);
    expect(reply).toContain(GUIDE_REPLY_DISCLAIMER);
    expect(reply.trim().endsWith(GUIDE_REPLY_DISCLAIMER)).toBe(true);
    expect(RECOMMENDATION_SIGNAL_RULES).toContain("not personalised financial advice");
    expect(RECOMMENDATION_SIGNAL_RULES).toContain("Never invent a ticker");
    expect(RECOMMENDATION_SIGNAL_RULES).toContain("as-of time");
  });
});

describe("AI-CHAT-SIGNALS-1 prompt wiring", () => {
  beforeEach(() => {
    chat.length = 0;
    reports = [];
    grok.mockClear();
  });

  it("snapshots the tool payload wired into the model call", async () => {
    reports = [
      {
        bot: "stock",
        generated_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        payload: JSON.stringify({
          tickers: [
            { ticker: "FPH.NZ", name: "Fisher & Paykel Healthcare", price: 36.8, signal: "Strong Buy", sentiment: 80, call: call(38, 40) },
            { ticker: "AIR.NZ", name: "Air New Zealand", price: 1, signal: "Sell", sentiment: 20, call: call(0.8, 0.9) },
            { ticker: "MEL.NZ", name: "Meridian Energy", price: 6, sentiment: 55 },
          ],
        }),
      },
    ];
    const { POST } = await import("@/app/api/chat/route");
    const res = await POST(post("What's the best buy today on NZX?"));
    const body = (await res.json()) as { ok: boolean; data: { reply: string } };
    expect(body.ok).toBe(true);
    expect(body.data.reply).toContain(GUIDE_REPLY_DISCLAIMER);
    expect(body.data.reply).toMatch(/As of /);
    expect(grok).toHaveBeenCalledTimes(1);
    const messages = grok.mock.calls[0][0].messages as { role: string; content: string }[];
    const system = messages[0].content;
    expect(system).toContain(ANALYST_SYSTEM_PROMPT);
    expect(system).toContain(RECOMMENDATION_SIGNAL_RULES);
    expect(system).toContain("FPH.NZ");
    expect(system).toContain("Fisher & Paykel Healthcare");
    expect(system).toContain("Strong Buy");
    expect(system).not.toContain("AIR.NZ");
    expect(system).not.toContain("MEL.NZ");
    expect(system).not.toContain("ZZZ");
    expect(system).not.toContain("t@example.com");
    const toolText = system.slice(system.indexOf('{"tool"'), system.indexOf("\n\nHello."));
    expect(messages).toEqual(
      recommendationSignalMessages({
        systemPrompt: ANALYST_SYSTEM_PROMPT,
        history: [{ role: "user", content: "What's the best buy today on NZX?" }],
        toolText,
      })
    );
    const tool = JSON.parse(toolText) as { tool: string; rows: { ticker: string; asOf: string }[]; asOf: string; asOfLabel: string };
    tool.asOf = "SNAPSHOT";
    tool.asOfLabel = "SNAPSHOT";
    for (const row of tool.rows) row.asOf = "SNAPSHOT";
    expect(tool).toMatchInlineSnapshot(`
      {
        "asOf": "SNAPSHOT",
        "asOfLabel": "SNAPSHOT",
        "cryptoProjections": "Crypto projections are paused. Koins does not publish a 7-day figure, odds, conviction, or a bull, base, or bear outlook. Live coin prices stay on Markets.",
        "platformCoverage": "exchange-only",
        "platformNote": "Platform availability is not in this feed. Use the exchange only. Do not say a ticker is offered on Sharesies, Hatch, Stake, IBKR or any other platform.",
        "rows": [
          {
            "asOf": "SNAPSHOT",
            "currency": "NZD",
            "exchange": "NZX",
            "label": "Strong Buy",
            "name": "Fisher & Paykel Healthcare",
            "platforms": [],
            "predictedPrice": 39,
            "price": 36.8,
            "score": 80,
            "ticker": "FPH.NZ",
          },
        ],
        "tool": "recommendation_signals",
      }
    `);
    expect(RECOMMENDATION_SIGNAL_RULES).toMatchInlineSnapshot(`
      "Recommendation signals are the tool result below. They are the bots' existing picks, already labelled and ranked.
      A Buy label means the bot's prediction is above the current price. A Sell label means it is below. A pick with no prediction is omitted.
      Never invent a ticker, name, label, price, currency, exchange or platform that is not in the tool result.
      If the tool result is empty, stale, failed, or not on this plan, say plainly that current recommendation signals aren't available.
      Always state the as-of time from the tool result.
      Use only the label written on each row. Do not rename Sell to Strong Sell, or Buy to Strong Buy.
      Keep the row order. It is already ranked by the existing strength.
      This is general information, not personalised financial advice. Do not tell the member what they personally should buy, sell or hold."
    `);
  });

  it("does not call the model when the feed is empty, stale, or not on a platform", async () => {
    const { POST } = await import("@/app/api/chat/route");
    const empty = (await (await POST(post("any strong sells?"))).json()) as { data: { reply: string } };
    expect(empty.data.reply).toContain("Current recommendation signals aren't available.");
    expect(empty.data.reply).toContain(GUIDE_REPLY_DISCLAIMER);
    expect(empty.data.reply).toContain("no as-of time");
    expect(grok).not.toHaveBeenCalled();

    reports = [
      {
        bot: "stock",
        generated_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        payload: JSON.stringify({
          tickers: [{ ticker: "FPH.NZ", name: "Fisher & Paykel Healthcare", price: 36.8, signal: "Strong Buy", call: call(38, 40) }],
        }),
      },
    ];
    const sharesies = (await (await POST(post("What's the best buy today on Sharesies?"))).json()) as { data: { reply: string } };
    expect(sharesies.data.reply).toContain("Sharesies is not in this feed");
    expect(sharesies.data.reply).toContain(GUIDE_REPLY_DISCLAIMER);
    expect(sharesies.data.reply).toMatch(/As of /);
    expect(sharesies.data.reply).not.toContain("FPH.NZ");
    expect(grok).not.toHaveBeenCalled();
  });

  it("still refuses a personal buy instruction, and does not fetch a new market feed", async () => {
    const { POST } = await import("@/app/api/chat/route");
    const res = await POST(post("Should I buy Fisher & Paykel Healthcare (FPH.NZ) shares now?"));
    const body = (await res.json()) as { data: { reply: string } };
    expect(body.data.reply).toContain("can't pick NZX or other shares");
    expect(grok).not.toHaveBeenCalled();
    const route = read("src/app/api/chat/route.ts");
    expect(route).toContain("isSharePickRequest(userMessage)");
    expect(route).not.toMatch(/yahoo|fetchQuotes|market-data|coingecko/i);
    expect(read("src/lib/chat-signals.server.ts")).not.toMatch(/yahoo|fetchQuotes|market-data|coingecko/i);
    expect(read("src/app/page.tsx")).not.toContain("chat-signals");
  });
});
