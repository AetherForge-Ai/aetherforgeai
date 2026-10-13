import { readFileSync } from "node:fs";
import path from "node:path";
import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const headerGet = vi.hoisted(() => vi.fn((): string | null => "guest"));
const getStableSessionUser = vi.hoisted(() => vi.fn());
const fetchQuotesForAssetClass = vi.hoisted(() => vi.fn());
const loadCryptoBoardLive = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  headers: async () => ({ get: headerGet }),
}));

vi.mock("@/lib/session", () => ({
  getStableSessionUser,
}));

vi.mock("@/lib/market-data", () => ({
  fetchQuotesForAssetClass,
  fetchHistoriesForAssetClass: vi.fn(),
  isLiveConfiguredFor: () => true,
}));

vi.mock("@/lib/crypto-tape", () => ({
  loadCryptoBoardLive,
}));

import ProjectionsPage from "@/app/projections/page";
import { GET } from "@/app/api/projections/route";
import { PROJECTIONS_MEMBER_LINE } from "@/lib/public-copy";

function read(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

function containsName(node: ReactNode, name: string): boolean {
  if (!isValidElement(node)) return false;
  const type = node.type as { name?: string; displayName?: string };
  const label = typeof node.type === "function" ? type.displayName || type.name || "" : "";
  if (label === name) return true;
  const children = (node.props as { children?: ReactNode }).children;
  const list = Array.isArray(children) ? children : [children];
  return list.some((child) => containsName(child, name));
}

function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (!isValidElement(node)) return "";
  return textOf((node.props as { children?: ReactNode }).children);
}

describe("D1 share projections are for members", () => {
  beforeEach(() => {
    headerGet.mockReset();
    getStableSessionUser.mockReset();
    fetchQuotesForAssetClass.mockReset();
    loadCryptoBoardLive.mockReset();
    headerGet.mockReturnValue("guest");
  });

  it("shows a sign-in prompt and no ranked projection table when signed out", async () => {
    headerGet.mockReturnValue("guest");
    const page = await ProjectionsPage();
    const text = textOf(page);
    expect(text).toContain(PROJECTIONS_MEMBER_LINE);
    expect(text).toContain("Sign in");
    expect(text).not.toMatch(/\b[A-Z]{2,5}\.(NZ|AX)\b/);
    expect(text).not.toContain("projected 7-day");
    expect(text).not.toContain("%");
    expect(containsName(page, "ProjectionsExplorer")).toBe(false);
    expect(read("src/app/projections/page.tsx")).toContain('headerList.get("x-af-doc") !== "member"');
    expect(read("src/app/sitemap.ts")).not.toContain('"/projections"');
    expect(read("src/app/projections/page.tsx")).toContain("index: false");
    expect(read("src/lib/help-index.ts")).toContain("PROJECTIONS_MEMBER_LINE");
    expect(PROJECTIONS_MEMBER_LINE).toContain("signed-in members");
    expect(read("src/app/pricing/page.tsx")).toContain("PROJECTIONS_MEMBER_LINE");
    expect(read("src/app/privacy-policy/page.tsx")).toContain("PROJECTIONS_MEMBER_LINE");
  });

  it("returns 401 and does not rank tickers when the session is missing", async () => {
    getStableSessionUser.mockResolvedValue(null);
    fetchQuotesForAssetClass.mockRejectedValue(new Error("signed-out sweep"));
    loadCryptoBoardLive.mockRejectedValue(new Error("signed-out tape"));
    const res = await GET(new Request("https://aetherforgeai.co.nz/api/projections?exchange=NZX"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Unauthorized" });
    expect(JSON.stringify(body)).not.toMatch(/ticker|projected7d|FBU|NZX/i);
    expect(fetchQuotesForAssetClass).not.toHaveBeenCalled();
    expect(loadCryptoBoardLive).not.toHaveBeenCalled();
  });
});
