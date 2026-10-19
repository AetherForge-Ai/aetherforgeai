// b42 goal test (version guard moved to goal-b43)
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { heldTickersFromRows } from "@/components/import/PasteTradesBox";

const read = (p: string) => readFileSync(p, "utf8");

describe("b42 P1 (b43: the af_so marker is retired; the server revoke stays)", () => {
  it("the server revokes a signed-out token everywhere and never re-issues af_ls for it", () => {
    const s = read("src/lib/session.ts");
    expect(s).toMatch(/ctx\.internalAdapter\.deleteSession\(token\)/);
    expect(s).toMatch(/if \(await isSessionTokenRevoked\(token, 300\)\) return null;/);
    expect(read("src/app/api/session/logout/route.ts")).toMatch(/revokeTokenEverywhere\(ctx, token\)/);
  });
  it("account pages use a fresh server session check", () => {
    for (const p of ["settings", "account", "profile", "onboarding", "import"]) {
      expect(read(`src/app/${p}/page.tsx`)).toMatch(/getCurrentUser\(\{ fresh: true \}\)/);
    }
    expect(read("src/lib/session.ts")).toMatch(/if \(!opts\.fresh && cached/);
  });
});

describe("b42 P3: a sell you don't hold is flagged on review without a cached book", () => {
  it("builds the held set from /api/stocks rows", () => {
    const held = heldTickersFromRows([{ ticker: "fph.nz", shares: 10 }, { ticker: "AIR.NZ", shares: 0 }, { symbol: "BTC", quantity: 0.1 }]);
    expect([...held].sort()).toEqual(["BTC", "FPH.NZ"]);
  });
  it("fetches holdings when the book is not cached", () => {
    const box = read("src/components/import/PasteTradesBox.tsx");
    expect(box).toMatch(/api\s*\.get<Array<Record<string, unknown>>>\("\/api\/stocks"\)/);
    expect(box).toMatch(/const held = bookHeld \?\? fetchedHeld;/);
  });
});
