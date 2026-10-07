import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  NZ_PUBLIC_HOLIDAYS_IN_REPO,
  PRODUCT_NOTE_DISCLAIMER,
  PRODUCT_NOTE_FROM,
  acceptAiScenario,
  addDays,
  assembleProductNote,
  dedupeRecipients,
  handleProductNoteRequest,
  parseOfficialCashRate,
  parseRssItems,
  productNoteKindAt,
  productNoteSendingEnabled,
  renderProductNote,
  runProductNoteJob,
  type IndexBar,
  type ProductNoteKind,
  type SymbolSeries,
  type VerifiedFacts,
} from "@/lib/product-note";

const MONDAY_1015 = new Date("2026-10-04T21:15:00Z");
const MONDAY_0900 = new Date("2026-10-04T20:00:00Z");
const WEDNESDAY_1015 = new Date("2026-10-06T21:15:00Z");
const FRIDAY_1715 = new Date("2026-10-09T04:15:00Z");
const FRIDAY_1640 = new Date("2026-10-09T03:40:00Z");
const BOARD = "https://www.aetherforgeai.co.nz/dashboard/markets/nzsx";

function bar(date: string, minutes: number, open: number | null, close: number | null): IndexBar {
  return { date, minutes, open, close };
}

function line(end: number, days = 45): { date: string; close: number }[] {
  const points = [];
  for (let i = days; i >= 0; i--) {
    const date = addDays("2026-10-05", -i);
    const close = 100 + ((end - 100) * (days - i)) / days;
    points.push({ date, close });
  }
  return points;
}

function movers(): SymbolSeries[] {
  const rows: SymbolSeries[] = [];
  for (let i = 1; i <= 11; i++) {
    const ticker = `T${String(i).padStart(2, "0")}.NZ`;
    rows.push({ ticker, name: `Name ${ticker}`, points: line(120 - (i - 1)) });
  }
  rows.push({ ticker: "DOWN.NZ", name: "Down Co", points: line(80) });
  return rows;
}

function facts(over: Partial<VerifiedFacts> = {}): VerifiedFacts {
  return {
    indexFetched: true,
    indexBars: [
      bar("2026-10-02", 10 * 60, 1000, 1000),
      bar("2026-10-02", 17 * 60, 1000, 1100),
      bar("2026-10-05", 10 * 60, 1200, 1200),
      bar("2026-10-07", 10 * 60, 1210, 1210),
      bar("2026-10-08", 17 * 60, 1220, 1235),
      bar("2026-10-09", 10 * 60, 1230, 1230),
      bar("2026-10-09", 17 * 60, 1230, 1240),
    ],
    markets: [{ market: "NZSX", requested: 12, series: movers() }],
    headlines: [
      {
        headline: "New Zealand exporters watch freight costs",
        url: "https://www.rnz.co.nz/news/business/freight-costs",
        publishedAt: "2026-10-04T01:00:00Z",
      },
      {
        headline: "RBNZ sets the OCR at 9.99 percent today",
        url: "https://www.rbnz.govt.nz/news/ocr-mismatch",
        publishedAt: "2026-10-04T02:00:00Z",
      },
    ],
    verifiedOcr: 3.25,
    scenarioText: "Prices can move either way from here. This picture is only an illustration.",
    boardUrl: BOARD,
    ...over,
  };
}

function note(kind: ProductNoteKind, now: Date, over: Partial<VerifiedFacts> = {}) {
  return renderProductNote(assembleProductNote(kind, now, facts(over)));
}

describe("product note schedule", () => {
  it("sends Monday and Wednesday at 10:15, and Friday at 17:15, Auckland", () => {
    expect(productNoteKindAt(MONDAY_1015)).toBe("monday");
    expect(productNoteKindAt(new Date("2026-10-04T21:29:00Z"))).toBe("monday");
    expect(productNoteKindAt(WEDNESDAY_1015)).toBe("wednesday");
    expect(productNoteKindAt(FRIDAY_1715)).toBe("friday");
    expect(productNoteKindAt(new Date("2026-07-05T22:15:00Z"))).toBe("monday");
  });

  it("does not treat 9:00am as the open, and skips the close before 17:15", () => {
    expect(productNoteKindAt(MONDAY_0900)).toBeNull();
    expect(productNoteKindAt(new Date("2026-10-04T21:14:00Z"))).toBeNull();
    expect(productNoteKindAt(new Date("2026-10-04T21:30:00Z"))).toBeNull();
    expect(productNoteKindAt(FRIDAY_1640)).toBeNull();
    expect(productNoteKindAt(new Date("2026-10-09T04:14:00Z"))).toBeNull();
  });

  it("skips weekends only, because this repo has no NZ public-holiday list", () => {
    expect(NZ_PUBLIC_HOLIDAYS_IN_REPO).toBe(false);
    expect(productNoteKindAt(new Date("2026-10-09T21:15:00Z"))).toBeNull();
    expect(productNoteKindAt(new Date("2026-10-10T21:15:00Z"))).toBeNull();
    // Waitangi Day 2026 falls on a Friday. It is not skipped.
    expect(productNoteKindAt(new Date("2026-02-06T04:15:00Z"))).toBe("friday");
  });
});

describe("product note rendering", () => {
  it("renders the Monday week-open note from fixture figures", () => {
    const rendered = note("monday", MONDAY_1015);
    expect(rendered.subject).toBe("AetherForge AI week-open note");
    expect(rendered.text).toContain("Good morning from the team at AetherForge AI.");
    expect(rendered.text).toContain("NZSX at the open");
    expect(rendered.text).toContain("The S&P/NZX 50 opened at 1,200.00 on 5 Oct 2026.");
    expect(rendered.text).toContain("+9.1% from the previous close.");
    expect(rendered.text).toContain(BOARD);
    expect(rendered.text).toContain("not a view on how the week will go");
    expect(rendered.text).toContain("Last week, top share-price increases");
    expect(rendered.text).toContain("Last 30 days, top share-price increases");
    expect(rendered.text).toContain("T01.NZ");
    expect(rendered.text).not.toContain("T11.NZ");
    expect(rendered.text).not.toContain("DOWN.NZ");
    expect(rendered.text).not.toMatch(/\nASX\n/);
    expect(rendered.text).toContain("4 Oct 2026, RNZ. New Zealand exporters watch freight costs");
    expect(rendered.text).toContain("https://www.rnz.co.nz/news/business/freight-costs");
    expect(rendered.text).not.toContain("9.99");
    expect(rendered.text).not.toContain("Reuters");
    expect(rendered.text).toContain("It is not a forecast, and it is not an instruction to buy or sell.");
    expect(rendered.text).not.toMatch(/\brecommend(?:ation)?s?\b/i);
    expect(rendered.text).toContain("Prices can move either way from here.");
    expect(rendered.text).toContain("Wishing you a good week.");
    expect(rendered.text.split(PRODUCT_NOTE_DISCLAIMER)).toHaveLength(2);
    expect(rendered.html).toContain(`href="${BOARD}"`);
    expect(rendered.html.replace(/<style[\s\S]*?<\/style>/g, "")).not.toMatch(/style=/);
    expect(rendered.text).not.toMatch(/\b(Grok|SuperGrok|xAI|RSI|MACD)\b/);
  });

  it("says the open is not in yet, and says unavailable when the index was not fetched", () => {
    const notIn = note("monday", MONDAY_1015, {
      indexBars: [bar("2026-10-02", 17 * 60, 1000, 1100)],
    });
    expect(notIn.text).toContain("The NZSX open is not in yet.");
    expect(notIn.text).toContain("does not describe the session");
    expect(notIn.text).not.toContain("opened at");

    const missing = note("monday", MONDAY_1015, { indexFetched: false, indexBars: [] });
    expect(missing.text).toContain("NZSX open figures are unavailable.");
    expect(missing.text).toContain("A verified overview is unavailable.");
    expect(missing.text).not.toContain("opened at");
  });

  it("renders the short Wednesday note", () => {
    const rendered = note("wednesday", WEDNESDAY_1015);
    expect(rendered.subject).toBe("AetherForge AI midweek note");
    expect(rendered.text).toContain("Good morning from the team at AetherForge AI.");
    expect(rendered.text).toContain("Since the last note");
    expect(rendered.text).toContain("from 1,200.00 on 5 Oct 2026 to 1,210.00 on 7 Oct 2026");
    expect(rendered.text).toContain("Top movers");
    expect(rendered.text).not.toContain("Last 30 days");
    expect(rendered.text).not.toContain("NZSX at the open");
    expect(rendered.text).toContain("Wishing you a good rest of the week.");
    expect(rendered.text).toContain("It is not a forecast, and it is not an instruction to buy or sell.");
    expect(rendered.text).not.toMatch(/\brecommend(?:ation)?s?\b/i);
    expect(rendered.text.split(PRODUCT_NOTE_DISCLAIMER)).toHaveLength(2);
    expect(rendered.text).not.toMatch(/\b(Grok|SuperGrok|xAI)\b/);
  });

  it("renders the Friday close, the week, and a weekend item when one is real", () => {
    const rendered = note("friday", FRIDAY_1715, {
      headlines: [
        ...facts().headlines,
        {
          headline: "Global oil markets stay in focus this weekend",
          url: "https://www.bbc.com/news/business/oil-weekend",
          publishedAt: "2026-10-09T01:00:00Z",
        },
      ],
    });
    expect(rendered.subject).toBe("AetherForge AI week-close note");
    expect(rendered.text).toContain("Good afternoon from the team at AetherForge AI.");
    expect(rendered.text).toContain("The S&P/NZX 50 closed at 1,240.00 on 9 Oct 2026.");
    expect(rendered.text).toContain("Since the last note");
    expect(rendered.text).toContain("from 1,210.00 on 7 Oct 2026 to 1,240.00 on 9 Oct 2026");
    expect(rendered.text).toContain("This week the S&P/NZX 50 moved from 1,200.00 on 5 Oct 2026 to 1,240.00 on 9 Oct 2026.");
    expect(rendered.text).toContain("One global item to be aware of over the weekend:");
    expect(rendered.text).toContain("BBC, 9 Oct 2026");
    expect(rendered.text).toContain("This is not a suggestion to act.");
    expect(rendered.text).toContain("Wishing you a good weekend.");
    expect(rendered.text).toContain("It is not a forecast, and it is not an instruction to buy or sell.");
    expect(rendered.text).not.toMatch(/\brecommend(?:ation)?s?\b/i);
    expect(rendered.text).not.toContain("Wishing you a good week.");
    expect(rendered.text.split(PRODUCT_NOTE_DISCLAIMER)).toHaveLength(2);
  });

  it("leaves the weekend line out when nothing solid is there, and says the close is not in", () => {
    const rendered = note("friday", FRIDAY_1715, {
      indexBars: [
        bar("2026-10-05", 10 * 60, 1200, 1200),
        bar("2026-10-09", 10 * 60, 1230, 1230),
      ],
    });
    expect(rendered.text).toContain("The NZSX close is not in yet.");
    expect(rendered.text).toContain("A verified summary of this week's activity is unavailable.");
    expect(rendered.text).toContain("What changed since the last note is unavailable.");
    expect(rendered.text).not.toContain("Over the weekend");
    expect(rendered.text).not.toContain("closed at");
  });

  it("drops an AI paragraph that names a vendor or tells the reader to trade", () => {
    const rendered = note("monday", MONDAY_1015, {
      scenarioText: "Our Grok model recommends a buy with a 100% win rate.",
    });
    expect(rendered.text).toContain("An AI explanation is unavailable.");
    expect(rendered.text).not.toMatch(/\brecommend(?:ation)?s?\b/i);
    expect(rendered.text).not.toMatch(/\bGrok\b/);
    expect(rendered.text).not.toContain("100%");
    expect(rendered.text).not.toContain("win rate");
    expect(acceptAiScenario("A quiet tape can stay quiet. That is only an illustration.")).toMatch(/illustration/);
  });
});

describe("product note honesty helpers", () => {
  it("reads one current OCR phrase and refuses a mixed history", () => {
    expect(parseOfficialCashRate("<p>The Official Cash Rate (OCR) is 3.25 percent.</p>")).toBe(3.25);
    expect(parseOfficialCashRate("<p>OCR is 3.25%. OCR is 5.50%.</p>")).toBeNull();
    expect(parseOfficialCashRate("<table><tr><td>2.50%</td><td>5.50%</td></tr></table>")).toBeNull();
  });

  it("parses a dated RSS item and keeps registered emails once", () => {
    const items = parseRssItems(
      `<rss><channel><item><title>Freight costs in focus</title><link>https://www.rnz.co.nz/x</link><pubDate>Sat, 04 Oct 2026 01:00:00 GMT</pubDate></item></channel></rss>`
    );
    expect(items).toHaveLength(1);
    expect(items[0].link).toContain("rnz.co.nz");
    expect(
      dedupeRecipients([
        { email: "Ada@example.com" },
        { email: "ada@example.com" },
        { email: "not-an-email" },
        { email: "" },
        { email: null },
      ])
    ).toEqual([{ email: "Ada@example.com" }]);
  });
});

describe("product note sender", () => {
  it("is off unless the switch is exactly on", () => {
    expect(process.env.PRODUCT_NOTE_SEND).not.toBe("on");
    expect(productNoteSendingEnabled({})).toBe(false);
    expect(productNoteSendingEnabled({ PRODUCT_NOTE_SEND: "true" })).toBe(false);
    expect(productNoteSendingEnabled({ PRODUCT_NOTE_SEND: "1" })).toBe(false);
    expect(productNoteSendingEnabled({ PRODUCT_NOTE_SEND: "yes" })).toBe(false);
    expect(productNoteSendingEnabled({ PRODUCT_NOTE_SEND: "ON" })).toBe(false);
    expect(productNoteSendingEnabled({ PRODUCT_NOTE_SEND: "on" })).toBe(true);
  });

  it("does not build or send when the switch is off", async () => {
    let built = 0;
    let sent = 0;
    const result = await runProductNoteJob({
      now: MONDAY_1015,
      env: {},
      loadRecipients: async () => {
        throw new Error("recipients should not be loaded");
      },
      build: async () => {
        built += 1;
        throw new Error("build should not run");
      },
      send: async () => {
        sent += 1;
      },
    });
    expect(result).toMatchObject({ ok: true, sent: 0, sender: "off", reason: "sender-off" });
    expect(built).toBe(0);
    expect(sent).toBe(0);
  });

  it("does not send at 9:00am even if the switch is on", async () => {
    let sent = 0;
    const result = await runProductNoteJob({
      now: MONDAY_0900,
      env: { PRODUCT_NOTE_SEND: "on" },
      loadRecipients: async () => [{ email: "ada@example.com" }],
      build: async () => note("monday", MONDAY_1015),
      send: async () => {
        sent += 1;
      },
    });
    expect(result.reason).toBe("outside-window");
    expect(sent).toBe(0);
  });

  it("addresses each registered user from the admin mailbox when the switch is on", async () => {
    const sent: { to: string; from: string; replyTo: string }[] = [];
    const result = await runProductNoteJob({
      now: MONDAY_1015,
      env: { PRODUCT_NOTE_SEND: "on" },
      loadRecipients: async () => [{ email: "Ada@example.com" }, { email: "ada@example.com" }, { email: "boi@example.com" }],
      build: async () => note("monday", MONDAY_1015),
      send: async (message) => {
        sent.push({ to: message.to, from: message.from, replyTo: message.replyTo });
        expect(message.fromName).toBe("AetherForge AI");
        expect(message.subject).toBe("AetherForge AI week-open note");
      },
    });
    expect(result).toMatchObject({ sent: 2, sender: "on", reason: "sent", kind: "monday" });
    expect(sent.map((m) => m.to)).toEqual(["Ada@example.com", "boi@example.com"]);
    expect(sent.every((m) => m.from === PRODUCT_NOTE_FROM && m.replyTo === PRODUCT_NOTE_FROM)).toBe(true);
  });

  it("keeps the HTTP route from sending when the secret is missing, wrong, or the switch is off", async () => {
    let sent = 0;
    const send = async () => {
      sent += 1;
    };
    const build = async () => note("monday", MONDAY_1015);
    const loadRecipients = async () => [{ email: "ada@example.com" }];
    const headers = { get: (name: string) => (name === "x-cron-secret" ? "secret" : null) };

    const closed = await handleProductNoteRequest({
      url: "https://www.aetherforgeai.co.nz/api/cron/product-notes",
      headers,
      env: { PRODUCT_NOTE_SEND: "on" },
      now: MONDAY_1015,
      loadRecipients,
      build,
      send,
    });
    expect(closed.status).toBe(503);
    expect(closed.body.sent).toBe(0);

    const denied = await handleProductNoteRequest({
      url: "https://www.aetherforgeai.co.nz/api/cron/product-notes",
      headers: { get: () => null },
      env: { CRON_SECRET: "secret", PRODUCT_NOTE_SEND: "on" },
      now: MONDAY_1015,
      loadRecipients,
      build,
      send,
    });
    expect(denied.status).toBe(401);

    const off = await handleProductNoteRequest({
      url: "https://www.aetherforgeai.co.nz/api/cron/product-notes",
      headers,
      env: { CRON_SECRET: "secret" },
      now: MONDAY_1015,
      loadRecipients,
      build,
      send,
    });
    expect(off.status).toBe(200);
    expect(off.body).toMatchObject({ sent: 0, sender: "off", reason: "sender-off" });
    expect(sent).toBe(0);
  });

  it("refuses in the live mail function before sendEmail, and installs no cron", () => {
    const live = readFileSync("src/lib/product-note-live.ts", "utf8");
    const deliver = live.slice(live.indexOf("export async function deliverProductNote"));
    expect(deliver.indexOf("productNoteSendingEnabled()")).toBeGreaterThan(-1);
    expect(deliver.indexOf("productNoteSendingEnabled()")).toBeLessThan(deliver.indexOf("sendTransactionalEmail"));
    expect(deliver).not.toContain("text:");
    expect(readFileSync("wrangler.jsonc", "utf8")).not.toContain("crons");
    expect(readFileSync("src/app/api/cron/product-notes/route.ts", "utf8")).toContain("No cron trigger is installed");
  });
});
