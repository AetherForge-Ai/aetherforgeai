import { readFileSync } from "node:fs";
import path from "node:path";
import { isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cookieValue, verifySignedSessionToken } from "@/lib/session-token";

vi.mock("server-only", () => ({}));

const headerGet = vi.hoisted(() => vi.fn((name: string): string | null => null));
const fetchQuotesForAssetClass = vi.hoisted(() => vi.fn());
const loadCryptoBoardLive = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  headers: async () => ({ get: (name: string) => headerGet(name.toLowerCase()) }),
}));

vi.mock("@/lib/session", async () => {
  const { headers } = await import("next/headers");
  const token = await import("@/lib/session-token");
  return {
    getStableSessionUser: async () => {
      const headerList = await headers();
      const raw = token.cookieValue(headerList.get("cookie"), "better-auth.session_token");
      const sessionToken = await token.verifySignedSessionToken(raw, "test-secret");
      if (!sessionToken) return null;
      return { id: "member-1", _id: "member-1", email: "member@example.com", name: "Member" };
    },
  };
});

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

const FORGED_COOKIE = "better-auth.session_token=forged.not-a-session";

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

function findElement(node: ReactNode, name: string): ReactNode {
  if (!isValidElement(node)) return null;
  const type = node.type as { name?: string; displayName?: string };
  const label = typeof node.type === "function" ? type.displayName || type.name || "" : "";
  if (label === name) return node;
  const children = (node.props as { children?: ReactNode }).children;
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    const found = findElement(child, name);
    if (found) return found;
  }
  return null;
}

const CLIENT_REFERENCES = new Set(["AppShell", "ProjectionsExplorer", "Link"]);

/** Flight text for the server tree Next sends on GET /projections?_rsc=1. */
function rscFlight(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(rscFlight).join("\n");
  if (!isValidElement(node)) return "";
  const type = node.type as { name?: string; displayName?: string };
  const label = typeof node.type === "function" ? type.displayName || type.name || "component" : String(node.type);
  const props = node.props as { children?: ReactNode };
  if (typeof node.type === "function" && CLIENT_REFERENCES.has(label)) {
    return `${label}\n${rscFlight(props.children)}`;
  }
  if (typeof node.type === "function") {
    return `${label}\n${rscFlight((node.type as (props: unknown) => ReactNode)(node.props))}`;
  }
  return rscFlight(props.children);
}

describe("D1 share projections are for members", () => {
  beforeEach(() => {
    headerGet.mockReset();
    fetchQuotesForAssetClass.mockReset();
    loadCryptoBoardLive.mockReset();
    headerGet.mockImplementation((name: string) => {
      if (name === "cookie") return FORGED_COOKIE;
      if (name === "x-af-doc") return "member";
      return null;
    });
  });

  it("with a forged session cookie and no valid session, the page HTML has the sign-in prompt and no ranked rows", async () => {
    expect(cookieValue(FORGED_COOKIE, "better-auth.session_token")).toBe("forged.not-a-session");
    expect(await verifySignedSessionToken("forged.not-a-session", "test-secret")).toBeNull();
    const page = await ProjectionsPage();
    const signIn = findElement(page, "ProjectionsSignIn");
    expect(signIn).toBeTruthy();
    expect(containsName(page, "ProjectionsExplorer")).toBe(false);
    const html = renderToStaticMarkup(signIn as React.ReactElement);
    expect(html).toContain("Sign in");
    expect(html).toContain(PROJECTIONS_MEMBER_LINE);
    expect(html).not.toMatch(/\b[A-Z]{2,5}\.(NZ|AX)\b/);
    expect(html).not.toContain("projected 7-day");
    expect(html).not.toContain("model confidence");
    expect(html).not.toContain("%");
    expect(read("src/app/projections/page.tsx")).toContain("getStableSessionUser");
    expect(read("src/app/projections/page.tsx")).not.toContain("x-af-doc");
    expect(read("src/app/projections/page.tsx")).not.toContain("rows=");
    expect(read("src/components/dashboard/ProjectionsExplorer.tsx")).toContain("res.status === 401");
    expect(read("src/components/dashboard/ProjectionsExplorer.tsx")).toContain("<ProjectionsSignIn />");
  });

  it("the RSC payload (?_rsc=1) has no ranked rows for a forged session cookie", async () => {
    const page = await ProjectionsPage();
    const flight = rscFlight(page);
    expect(flight).toContain("ProjectionsSignIn");
    expect(flight).toContain("Sign in");
    expect(flight).not.toContain("ProjectionsExplorer");
    expect(flight).not.toMatch(/projected7d|FBU\.NZ|"rows"/);
    expect(flight).not.toContain("model confidence");
  });

  it("GET /api/projections returns 401 for a forged session cookie", async () => {
    fetchQuotesForAssetClass.mockRejectedValue(new Error("signed-out sweep"));
    loadCryptoBoardLive.mockRejectedValue(new Error("signed-out tape"));
    const res = await GET(
      new Request("https://aetherforgeai.co.nz/api/projections?exchange=NZX", {
        headers: {
          cookie: FORGED_COOKIE,
          "x-af-doc": "member",
        },
      })
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Unauthorized" });
    expect(JSON.stringify(body)).not.toMatch(/ticker|projected7d|FBU|rows/i);
    expect(fetchQuotesForAssetClass).not.toHaveBeenCalled();
    expect(loadCryptoBoardLive).not.toHaveBeenCalled();
  });
});
