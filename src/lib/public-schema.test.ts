import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { faqJsonLd, softwareApplicationJsonLd } from "@/lib/public-schema";

function read(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("public schema", () => {
  it("publishes FAQ, breadcrumb and software data without a rating", () => {
    const faq = faqJsonLd();
    expect(faq["@type"]).toBe("FAQPage");
    expect(faq.mainEntity.length).toBeGreaterThan(0);
    const app = softwareApplicationJsonLd();
    expect(app.offers.map((offer) => offer.price)).toEqual(["0", "16", "49", "199"]);
    expect(app.offers.every((offer) => offer.priceCurrency === "NZD")).toBe(true);
    expect(app.description).toContain("All prices in NZD");
    const blob = JSON.stringify({ faq, app });
    expect(blob).not.toMatch(/AggregateRating|Review|ratingValue/);
    const taxWord = ["G", "ST"].join("");
    expect(blob).not.toContain(taxWord);

    const pricing = read("src/app/pricing/page.tsx");
    expect(pricing).toContain("faqJsonLd");
    expect(pricing).toContain("softwareApplicationJsonLd");
    expect(pricing).toContain("breadcrumbJsonLd");
    const login = read("src/app/login/page.tsx");
    const register = read("src/app/register/page.tsx");
    expect(login).toContain('<h1 className="sr-only">Sign in</h1>');
    expect(register).toContain('<h1 className="sr-only">Check your email</h1>');
    expect(register).toContain('<h1 className="sr-only">Create an account</h1>');
    expect(read("src/lib/public-schema.ts")).toContain("pull-check:batch2-2026-10-11 B2-11");
  });
});