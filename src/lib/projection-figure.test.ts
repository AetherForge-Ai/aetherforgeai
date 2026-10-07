import { describe, expect, it } from "vitest";
import { analyzeSecurity } from "@/lib/market-intel";
import { alignProjectedFigures, impliedMovePct, projectionPointPct } from "@/lib/projection-figure";

describe("one projected figure", () => {
  it("pulls the outlook and the +7d point onto projected7dPct", () => {
    const row = alignProjectedFigures({
      price: 10,
      projected7dPct: 5.22,
      outlook: { expectedPct: 55 },
      projection: [
        { label: "+1d", price: 10.2 },
        { label: "+7d", price: 12.78 },
      ],
    });
    expect(row.outlook?.expectedPct).toBe(5.22);
    expect(row.projected7dPct).toBe(5.22);
    expect(projectionPointPct(row.price, row.projection)).toBe(5.22);
    expect(impliedMovePct(row.price, row.projection![1].price)).toBe(5.22);
  });

  it("keeps analyzeSecurity aligned across the three fields", () => {
    const row = analyzeSecurity("AIR.NZ");
    expect(row.outlook.expectedPct).toBe(row.projected7dPct);
    expect(projectionPointPct(row.price, row.projection)).toBe(row.projected7dPct);
  });
});
