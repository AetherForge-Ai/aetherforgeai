import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("M-1 page speed", () => {
  it("keeps gzip on for the Node server", () => {
    expect(read("next.config.ts")).toMatch(/compress:\s*true/);
  });

  it("preloads only the body face and does not block paint on a late font", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toMatch(/manrope-latin\.woff2/);
    expect(layout).toMatch(/display:\s*"swap"/); // b28 review: fonts must render on a first visit
    expect(layout).not.toMatch(/grift-black\.otf/);
    const sora = layout.slice(layout.indexOf("sora-latin.woff2"), layout.indexOf("manrope-latin.woff2"));
    expect(sora).toMatch(/preload:\s*true/); // b45 P3: heading face preloaded to stop the cold-load swap shift
  });

  it("serves Grift as woff2 with font-display swap", () => {
    const css = read("src/app/globals.css");
    expect(css).toMatch(/grift-black\.woff2/);
    expect(css).toMatch(/grift-regular\.woff2/);
    expect(css).toMatch(/font-display:\s*swap/);
  });

  it("does not put the home guide or the signed-in coach in the first guest bundle", () => {
    const guide = read("src/components/personal-guide/LazyPersonalGuide.tsx");
    expect(guide).toMatch(/import\("\.\/PersonalGuide"\)/);
    expect(guide).toMatch(/15_000/);
    expect(guide).toMatch(/mode === "member"/);
    const coach = read("src/components/MemberCoachSlot.tsx");
    expect(coach).toMatch(/mode !== "member"/);
    expect(coach).toMatch(/ssr:\s*false/);
    expect(read("src/components/DevOnlyTools.tsx")).toMatch(/NODE_ENV === "production"/);
  });

  it("streams the home hero ahead of the tape", () => {
    const page = read("src/app/page.tsx");
    expect(page).toMatch(/export default function LandingPage/);
    expect(page).not.toMatch(/export default async function LandingPage/);
    expect(page).toMatch(/<Suspense fallback=\{<TickerFallback/);
    expect(page).toMatch(/HomeTickerBand/);
  });
});
