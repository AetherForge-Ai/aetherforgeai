import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import { clearLoginDraft, failLoginDraft, readLoginDraft, writeLoginDraft } from "@/lib/login-draft";
import { postLoginPath, safeRelativeRedirect } from "@/lib/safe-redirect";

function read(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("M3 login draft", () => {
  beforeEach(() => clearLoginDraft());

  it("keeps email and password across a remount and shows a failed submit", () => {
    writeLoginDraft({ email: "member@example.com", password: "secret-pass" });
    const remounted = readLoginDraft();
    expect(remounted.email).toBe("member@example.com");
    expect(remounted.password).toBe("secret-pass");
    failLoginDraft(remounted.email, remounted.password, "Error signing in. Please check your credentials.");
    const after = readLoginDraft();
    expect(after.email).toBe("member@example.com");
    expect(after.password).toBe("secret-pass");
    expect(after.error).toMatch(/check your credentials/);
  });
});

describe("register redirect", () => {
  it("keeps a same-origin coin path and rejects an open redirect", () => {
    expect(safeRelativeRedirect("/markets/crypto/ada?buy=1")).toBe("/markets/crypto/ada?buy=1");
    expect(safeRelativeRedirect("https://evil.example/phish")).toBeNull();
    expect(safeRelativeRedirect("//evil.example")).toBeNull();
    expect(safeRelativeRedirect("/\\evil.example")).toBeNull();
    expect(safeRelativeRedirect("/%2F%2Fevil.example")).toBeNull();
    expect(postLoginPath("/markets/crypto/ada?buy=1")).toBe("/markets/crypto/ada?buy=1");
    expect(postLoginPath("https://evil.example")).toBe("/dashboard");
  });

  it("passes a safe redirect from register to the verified-email login link", () => {
    const page = read("src/app/register/page.tsx");
    expect(page).toContain("safeRelativeRedirect");
    expect(page).toContain("Go to Log In");
    expect(page).toContain("href={loginHref}");
    expect(page).not.toContain('href="/login"');
    const login = read("src/app/login/page.tsx");
    expect(login).toContain("failLoginDraft");
    expect(login).not.toContain("useSearchParams");
    expect(login).not.toContain("auth.ts");
  });
});
