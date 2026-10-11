import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { documentAccess } from "@/lib/route-gate";
import { webPushConfigured } from "@/lib/web-push";

function read(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("installable shell", () => {
  it("meets the manifest and service worker checks and keeps push off", () => {
    const manifest = JSON.parse(read("public/site.webmanifest"));
    expect(manifest.name).toBe("AetherForge AI");
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
    const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");

    const sw = read("public/sw.js");
    expect(sw).toContain("install");
    expect(sw).toContain("fetch");
    expect(sw).toContain("/offline");
    expect(sw).not.toMatch(/VAPID|pushManager/);

    const offline = read("src/app/offline/page.tsx");
    expect(offline).toContain("Last updated");
    expect(offline).toContain("stale");
    expect(offline).toContain("Holdings are not stored");

    expect(read("src/app/layout.tsx")).toContain("PwaRegister");
    expect(read("src/components/PwaRegister.tsx")).not.toContain("pushManager");
    expect(webPushConfigured({})).toBe(false);
    expect(documentAccess("/offline")).toBe("public");
    expect(read("src/lib/web-push.ts")).toContain("pull-check:batch2-2026-10-11 B2-9");
  });
});
