import { describe, expect, it } from "vitest";
import { providerRateAsOf } from "@/lib/fx";

describe("provider FX rate time", () => {
  it("uses open.er-api time_last_update_unix and never invents a date", () => {
    expect(providerRateAsOf(1_759_833_600)).toBe("2025-10-07T10:40:00.000Z");
    expect(providerRateAsOf("1759833600")).toBe("2025-10-07T10:40:00.000Z");
    expect(providerRateAsOf(undefined)).toBeNull();
    expect(providerRateAsOf(null)).toBeNull();
    expect(providerRateAsOf(0)).toBeNull();
    expect(providerRateAsOf("")).toBeNull();
    expect(providerRateAsOf("nope")).toBeNull();
  });
});
