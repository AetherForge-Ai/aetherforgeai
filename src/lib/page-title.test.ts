import { describe, expect, it } from "vitest";
import { pageTitle } from "@/lib/page-title";

describe("M9 page titles", () => {
  it("uses one em dash before the brand", () => {
    expect(pageTitle("Privacy Policy — AetherForge AI")).toBe("Privacy Policy — AetherForge AI");
    expect(pageTitle("Terms")).toBe("Terms — AetherForge AI");
    expect(pageTitle("Pricing — AetherForge AI | Simple, powerful market intelligence")).toBe(
      "Pricing — AetherForge AI",
    );
    expect(pageTitle("Example results · AetherForge AI")).toBe("Example results — AetherForge AI");
    expect(pageTitle("Sign in · AetherForge AI")).toBe("Sign in — AetherForge AI");
    expect(pageTitle("AetherForge AI — Intelligent Market Analysis")).toBe(
      "AetherForge AI — Intelligent Market Analysis",
    );
  });
});
