import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { aucklandYmd } from "@/lib/entitlements";
import { aucklandDateISO } from "@/lib/fill-integrity";
import { assessMovement, movementCivilDay } from "@/lib/transaction-rules";

function correction(date: string, today: string): string | null {
  return assessMovement({
    type: "correction",
    date,
    today,
    quantity: 1,
    price: 0.00001,
    held: 1,
    hasAsset: true,
    cashKnown: true,
    cashAfterNzd: 0,
    cashChangeNzd: 0,
    needsCash: false,
    fromHoldingEdit: true,
  });
}

describe("U2 correction dated today in Pacific/Auckland", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows today at 00:30 NZDT while the UTC date is still the previous day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-09T11:30:00.000Z"));
    expect(new Date().toISOString().slice(0, 10)).toBe("2026-10-09");
    expect(aucklandYmd()).toBe("2026-10-10");
    expect(aucklandDateISO()).toBe("2026-10-10");
    const today = aucklandYmd();
    expect(movementCivilDay("2026-10-10", today)).toBe("2026-10-10");
    expect(correction("2026-10-10", today)).toBeNull();
    expect(movementCivilDay("2026-10-10T12:00:00.000Z", today)).toBe("2026-10-11");
    expect(correction("2026-10-11", today)).toBe("The date can't be in the future.");
  });

  it("allows today through the NZ morning while UTC is still the previous day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-09T23:30:00.000Z"));
    expect(new Date().toISOString().slice(0, 10)).toBe("2026-10-09");
    expect(aucklandYmd()).toBe("2026-10-10");
    expect(correction("2026-10-10", aucklandDateISO())).toBeNull();
    expect(correction("2026-10-11", aucklandDateISO())).toBe("The date can't be in the future.");
  });

  it("allows today late in the evening and rejects tomorrow", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T09:30:00.000Z"));
    expect(aucklandYmd()).toBe("2026-10-10");
    expect(aucklandDateISO()).toBe("2026-10-10");
    expect(correction("2026-10-10", aucklandYmd())).toBeNull();
    expect(correction("2026-10-11", aucklandYmd())).toBe("The date can't be in the future.");
  });

  it("compares the correction date with the same Auckland day as buy and sell", () => {
    const panel = readFileSync(path.join(process.cwd(), "src/components/dashboard/RecordTransactionPanel.tsx"), "utf8");
    const dialog = readFileSync(path.join(process.cwd(), "src/components/dashboard/StockDialog.tsx"), "utf8");
    const route = readFileSync(path.join(process.cwd(), "src/app/api/stocks/[id]/route.ts"), "utf8");
    const rules = readFileSync(path.join(process.cwd(), "src/lib/transaction-rules.ts"), "utf8");
    expect(panel).toContain("aucklandYmd()");
    expect(panel).toContain("transactionProblems");
    expect(rules).toContain("The date can't be in the future.");
    expect(rules).toContain("export function assessMovement");
    expect(dialog).toContain("aucklandYmd()");
    expect(dialog).not.toContain("getTimezoneOffset");
    expect(panel).not.toContain("getTimezoneOffset");
    expect(route).toContain("executed_at: civilDay");
    expect(route).toContain("The date can't be in the future.");
    expect(route).not.toContain("T12:00:00.000Z");
  });
});
