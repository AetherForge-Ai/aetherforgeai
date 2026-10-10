import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const createRecord = vi.hoisted(() => vi.fn());
const query = vi.hoisted(() => vi.fn());
const getRecordById = vi.hoisted(() => vi.fn());
const editRecordById = vi.hoisted(() => vi.fn());

vi.mock("@/lib/totalum", () => ({
  totalumSdk: {
    crud: {
      createRecord,
      query,
      getRecordById,
      editRecordById,
      deleteRecordById: vi.fn(),
    },
  },
}));

vi.mock("@/lib/fx", () => ({
  getFxSnapshot: vi.fn(async () => ({
    ratesToNZD: { NZD: 1, USD: 1.78, AUD: 1.12 },
    live: true,
    asOf: "2026-10-07T00:00:00.000Z",
  })),
  historicalNzdPerUnit: vi.fn(async () => null),
}));

vi.mock("@/lib/market-data", () => ({
  fetchLivePrice: vi.fn(async () => null),
  isLiveDataConfigured: vi.fn(() => false),
  fetchCryptoQuotes: vi.fn(async () => ({})),
}));

vi.mock("@/lib/crypto-coingecko", () => ({
  dexQuoteRows: vi.fn(async () => []),
}));

vi.mock("@/lib/metals", () => ({
  getMetalsSpot: vi.fn(async () => ({})),
}));

import { tradeSchema } from "@/lib/trade-schema";
import { bookHoldingFromStock } from "@/components/dashboard/RecordTransactionPanel";
import { dexFromLedger, dexSourceLabel, stripDexNotesPrefix } from "@/lib/dex-source";
import { computeSummary } from "@/lib/portfolio";
import { applyTransaction } from "@/lib/transactions";

const user = {
  _id: "user-1",
  id: "user-1",
  email: "member@example.com",
  name: "Member",
  cash_balance: 100000,
};

const dexBuy = {
  type: "buy" as const,
  ticker: "PEPE",
  asset_name: "Pepe",
  asset_type: "crypto" as const,
  quantity: 1000,
  price: 0.0000040399,
  fees: 0,
  confirm: true,
  fx_rate: 1.78,
  venue: "DEX" as const,
  chain: "Ethereum",
  executed_at: "2026-10-09",
  notes: "pool fill",
};

function created(collection: string) {
  return createRecord.mock.calls.filter((entry) => entry[0] === collection).map((entry) => entry[1]);
}

beforeEach(() => {
  createRecord.mockReset();
  createRecord.mockImplementation(async (collection: string) => ({ data: { _id: `${collection}-1` } }));
  query.mockReset();
  query.mockResolvedValue({ data: [] });
  getRecordById.mockReset();
  getRecordById.mockImplementation(async (collection: string) => {
    if (collection === "user") return { data: { cash_balance: 100000 } };
    return { data: { shares: 1000 } };
  });
  editRecordById.mockReset();
  editRecordById.mockResolvedValue({ data: {} });
});

describe("DEX buy storage", () => {
  it("keeps venue and chain through the schema into sector and notes", async () => {
    const parsed = tradeSchema.safeParse(dexBuy);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.venue).toBe("DEX");
    expect(parsed.data.chain).toBe("Ethereum");

    await applyTransaction(user, parsed.data);

    const [stock] = created("stock");
    expect(stock.sector).toBe("DEX · Ethereum");
    expect(stock).not.toHaveProperty("venue");
    expect(stock).not.toHaveProperty("chain");

    const [tx] = created("transaction");
    expect(String(tx.notes).startsWith("[DEX:Ethereum] ")).toBe(true);
    expect(tx).not.toHaveProperty("chain");
    const visible = stripDexNotesPrefix(tx.notes);
    expect(visible.startsWith("pool fill")).toBe(true);
    expect(visible).not.toContain("[DEX:");
    expect(dexFromLedger(tx)).toMatchObject({ venue: "DEX", chain: "Ethereum" });
    expect(dexSourceLabel({ notes: tx.notes, venue: tx.venue })).toBe("DEX · Ethereum");
  });

  it("shows the DEX badge on a sell opened from sector DEX · Ethereum", async () => {
    const holding = bookHoldingFromStock({
      _id: "stock-pepe",
      ticker: "PEPE",
      company_name: "Pepe",
      asset_type: "crypto",
      shares: 1000,
      current_price: 0.0000040399,
      purchase_price: 0.0000040399,
      sector: "DEX · Ethereum",
    });
    expect(holding.venue).toBe("DEX");
    expect(holding.chain).toBe("Ethereum");
    expect(dexSourceLabel(holding)).toBe("DEX · Ethereum");

    query.mockImplementation(async (collection: string) => {
      if (collection !== "stock") return { data: [] };
      return {
        data: [
          {
            _id: "stock-pepe",
            ticker: "PEPE",
            asset_type: "crypto",
            company_name: "Pepe",
            sector: "DEX · Ethereum",
            shares: 1000,
            purchase_price: 0.0000040399,
            user: "user-1",
          },
        ],
      };
    });
    let shares = 1000;
    getRecordById.mockImplementation(async (collection: string) => {
      if (collection === "user") return { data: { cash_balance: 100000 } };
      return { data: { shares } };
    });
    editRecordById.mockImplementation(async (collection: string, _id: string, patch: { shares?: number }) => {
      if (collection === "stock" && patch.shares != null) shares = patch.shares;
      return { data: {} };
    });

    const parsed = tradeSchema.safeParse({
      ...dexBuy,
      type: "sell",
      quantity: 100,
      notes: "taking some off",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    await applyTransaction(user, parsed.data);

    const stockEdits = editRecordById.mock.calls.filter((entry) => entry[0] === "stock").map((entry) => entry[2]);
    expect(stockEdits.some((patch) => patch.sector === "DEX · Ethereum")).toBe(true);
    for (const patch of stockEdits) {
      expect(patch).not.toHaveProperty("venue");
      expect(patch).not.toHaveProperty("chain");
    }
    const [tx] = created("transaction");
    expect(tx.notes.startsWith("[DEX:Ethereum] ")).toBe(true);
    expect(tx).not.toHaveProperty("chain");
    expect(dexSourceLabel({ notes: tx.notes, venue: tx.venue })).toBe("DEX · Ethereum");
  });

  it("groups DEX sector tags as one chart slice", () => {
    const summary = computeSummary(
      [
        {
          _id: "a",
          ticker: "PEPE",
          asset_type: "crypto",
          company_name: "Pepe",
          sector: "DEX · Ethereum",
          shares: 1000,
          purchase_price: 1,
          current_price: 2,
        },
        {
          _id: "b",
          ticker: "BONK",
          asset_type: "crypto",
          company_name: "Bonk",
          sector: "DEX · Solana",
          shares: 1000,
          purchase_price: 1,
          current_price: 2,
        },
        {
          _id: "c",
          ticker: "PEB.NZ",
          asset_type: "stock",
          company_name: "Pacific Edge",
          sector: "Healthcare",
          shares: 10,
          purchase_price: 1,
          current_price: 1,
        },
      ],
      { baseCurrency: "NZD" }
    );
    const names = summary.sectorAllocation.map((row) => row.sector).sort();
    expect(names).toEqual(["DEX", "Healthcare"]);
  });
});
