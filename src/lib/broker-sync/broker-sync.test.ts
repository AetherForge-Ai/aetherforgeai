import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { BROKER_KEY_MISSING, brokerKeyConfigured, decryptToken, encryptToken } from "./token-crypto.server";
import { flexCashRows, flexTradesCsv, parseFlexResponse, sendRequestUrl, statementPending, validFlexToken, validQueryId } from "./ibkr-flex";
import { publicConnection } from "./connection-store.server";
import { sheetsToCsv } from "@/lib/import/xlsx";
import { parseCsv } from "@/lib/import/csv";
import { detectBroker } from "@/lib/import/formats";
import { parseIbkr } from "@/lib/import/parsers/ibkr";

const env = { BROKER_TOKEN_KEY: randomBytes(32).toString("base64") };
const TOKEN = "1234567890123456789012";

describe("broker token encryption", () => {
  it("round-trips per user and hides the plaintext", async () => {
    const sealed = await encryptToken(TOKEN, "user-a", env);
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed).not.toContain(TOKEN);
    expect(await decryptToken(sealed, "user-a", env)).toBe(TOKEN);
    expect(await encryptToken(TOKEN, "user-a", env)).not.toBe(sealed);
  });
  it("refuses another user's ciphertext and a wrong key", async () => {
    const sealed = await encryptToken(TOKEN, "user-a", env);
    await expect(decryptToken(sealed, "user-b", env)).rejects.toThrow();
    await expect(decryptToken(sealed, "user-a", { BROKER_TOKEN_KEY: randomBytes(32).toString("base64") })).rejects.toThrow();
  });
  it("fails closed without a key", async () => {
    expect(brokerKeyConfigured({})).toBe(false);
    expect(brokerKeyConfigured({ BROKER_TOKEN_KEY: "short" })).toBe(false);
    await expect(encryptToken(TOKEN, "u", {})).rejects.toThrow(BROKER_KEY_MISSING);
  });
  it("public connection never carries the token", () => {
    const pub = publicConnection({ _id: "1", user: "u", broker: "ibkr", enc_token: "v1.secret", query_id: "123456", last_sync: null, status: "active", last_error: null });
    expect(JSON.stringify(pub)).not.toContain("secret");
    expect(Object.keys(pub || {})).not.toContain("enc_token");
  });
});

describe("IBKR Flex Web Service", () => {
  it("validates inputs and builds the read-only URL", () => {
    expect(validFlexToken(TOKEN)).toBe(true);
    expect(validFlexToken("abc")).toBe(false);
    expect(validQueryId("123456")).toBe(true);
    expect(validQueryId("12a")).toBe(false);
    expect(sendRequestUrl(TOKEN, "123456")).toContain("/SendRequest?t=");
  });
  it("reads SendRequest answers and errors", () => {
    expect(parseFlexResponse("<FlexStatementResponse><Status>Success</Status><ReferenceCode>987</ReferenceCode></FlexStatementResponse>")).toMatchObject({ ok: true, reference: "987" });
    expect(parseFlexResponse("<FlexStatementResponse><Status>Fail</Status><ErrorCode>1012</ErrorCode><ErrorMessage>x</ErrorMessage></FlexStatementResponse>")).toMatchObject({ ok: false, code: "1012" });
    expect(statementPending("<FlexStatementResponse><Status>Warn</Status><ErrorCode>1019</ErrorCode></FlexStatementResponse>")).toMatchObject({ ok: false, retry: true });
    expect(statementPending("<FlexQueryResponse><FlexStatements/></FlexQueryResponse>")).toBeNull();
  });
  it("turns XML trades into Flex CSV with the trade id, and cash into dividends and deposits", () => {
    const xml = `<FlexQueryResponse><FlexStatements><FlexStatement>
      <Trades><Trade tradeID="555" assetCategory="STK" symbol="AAPL" tradeDate="20260302" quantity="2" tradePrice="200" ibCommission="-1" buySell="BUY" currency="USD" fxRateToBase="1.7" proceeds="-400" accountId="U1"/></Trades>
      <CashTransactions>
        <CashTransaction transactionID="9" type="Dividends" symbol="AAPL" dateTime="20260315" amount="1.20" currency="USD" fxRateToBase="1.7"/>
        <CashTransaction transactionID="10" type="Deposits/Withdrawals" dateTime="20260301" amount="1000" currency="NZD" fxRateToBase="1"/>
        <CashTransaction transactionID="11" type="Withholding Tax" symbol="AAPL" dateTime="20260315" amount="-0.18" currency="USD"/>
      </CashTransactions></FlexStatement></FlexStatements></FlexQueryResponse>`;
    const csv = flexTradesCsv(xml);
    expect(csv.split("\n")[1]).toContain("555");
    expect(detectBroker(parseCsv(csv))).toBe("ibkr");
    expect(JSON.stringify(parseIbkr(parseCsv(csv)))).toContain("ibkr-555");
    const cash = flexCashRows(xml);
    expect(cash.map((c) => [c.id, c.kind])).toEqual([["ibkrcash-9", "dividend"], ["ibkrcash-10", "deposit"]]);
  });
});

describe("XLSX import", () => {
  it("joins Stake ASX and US tabs under one header and detects Stake", () => {
    const head = ["Trade Date", "Symbol", "Side", "Units", "Avg Price", "Brokerage", "Currency", "FX Rate"];
    const csv = sheetsToCsv([
      { name: "ASX", rows: [["Stake report"], head, ["2026-03-02", "BHP", "Buy", 10, 40, 3, "AUD", 1.1]] },
      { name: "US", rows: [head, ["2026-03-03", "AAPL", "Buy", 1, 200, 0, "USD", 1.7], []] },
      { name: "Notes", rows: [["a", "b", "c"]] },
    ]);
    const grid = parseCsv(csv);
    expect(grid.length).toBe(3);
    expect(detectBroker(grid)).toBe("stake");
  });
  it("still detects the existing IBKR fixture", () => {
    const text = readFileSync("src/lib/import/fixtures/ibkr.csv", "utf8");
    expect(detectBroker(parseCsv(text))).toBe("ibkr");
  });
});
