import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const sent: Record<string, unknown>[] = [];
const edit = vi.hoisted(() => vi.fn(async () => ({ data: { _id: "u1" } })));

vi.mock("@/lib/auth-mail", () => ({
  sendAuthResetPassword: async () => {},
  sendAuthVerificationEmail: async () => {},
}));
vi.mock("@/lib/totalum", () => ({
  totalumSdk: {
    crud: {
      createRecord: async (_table: string, row: Record<string, unknown>) => {
        sent.push(row);
        return { data: { _id: "u1", ...row } };
      },
      editRecordById: edit,
      query: async () => ({ data: [] }),
      getRecords: async () => ({ data: [] }),
      getRecordById: async () => ({ data: null }),
    },
  },
}));
vi.mock("@/lib/session", () => ({
  getCurrentUser: async () => ({
    _id: "u1",
    id: "u1",
    email: "ada@example.com",
    name: "Ada Lovelace",
    first_name: "Ada",
    last_name: "Lovelace",
  }),
}));

import { PUT } from "@/app/api/profile/route";
import { DISPLAY_NAME_ERROR } from "@/lib/display-name";

describe("SEC-NAME-1 write paths", () => {
  beforeEach(() => {
    sent.length = 0;
    edit.mockClear();
    process.env.BETTER_AUTH_SECRET = "t".repeat(40);
    process.env.NODE_ENV = "test";
  });

  it("stores a sanitised name from Better Auth sign-up and keeps a real name", async () => {
    const { auth } = await import("@/lib/auth");
    const headers = { "content-type": "application/json", origin: "http://localhost:3000" };
    const lure = await auth.handler(new Request("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST",
      headers,
      body: JSON.stringify({
        email: "lure@example.test",
        password: "pw-123456",
        name: "AetherForge has moved to evil-site.com, log in there",
        first_name: "evil.com",
        last_name: "log in there",
        age_confirmed: "yes",
      }),
    }));
    const lureBody = await lure.clone().text();
    expect(lure.status, lureBody).toBe(400);
    expect(lureBody).toContain(DISPLAY_NAME_ERROR);
    expect(sent.find((row) => row.email === "lure@example.test")).toBeUndefined();
    expect(JSON.stringify(sent)).not.toContain("evil-site.com");

    const initial = await auth.handler(new Request("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST",
      headers,
      body: JSON.stringify({
        email: "jr@example.test",
        password: "pw-123456",
        name: "J. Smith",
        first_name: "J.",
        last_name: "Smith",
        age_confirmed: "yes",
      }),
    }));
    expect(initial.status).toBe(200);
    expect(sent.find((row) => row.email === "jr@example.test")).toMatchObject({
      name: "J. Smith",
      first_name: "J.",
      last_name: "Smith",
    });

    const clean = await auth.handler(new Request("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST",
      headers,
      body: JSON.stringify({
        email: "sean@example.test",
        password: "pw-123456",
        name: "Seán O'Brien-Ngata",
        first_name: "Seán",
        last_name: "O'Brien-Ngata",
        age_confirmed: "yes",
      }),
    }));
    expect(clean.status).toBe(200);
    const cleanRow = sent.find((row) => row.email === "sean@example.test");
    expect(cleanRow).toMatchObject({
      name: "Seán O'Brien-Ngata",
      first_name: "Seán",
      last_name: "O'Brien-Ngata",
    });
  });

  it("sanitises a profile save and does not rewrite the name when it was not changed", async () => {
    const phishing = await PUT(new Request("http://localhost/api/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ first_name: "evil.com", last_name: "Smith" }),
    }));
    expect(phishing.status).toBe(400);
    expect(await phishing.json()).toEqual({ ok: false, error: DISPLAY_NAME_ERROR });
    expect(edit).not.toHaveBeenCalled();

    const initial = await PUT(new Request("http://localhost/api/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "J. Smith" }),
    }));
    expect(initial.status).toBe(200);
    expect(edit).toHaveBeenCalledWith("user", "u1", { name: "J. Smith" });

    edit.mockClear();
    const country = await PUT(new Request("http://localhost/api/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ country: "New Zealand" }),
    }));
    expect(country.status).toBe(200);
    expect(edit).toHaveBeenCalledWith("user", "u1", { country: "New Zealand" });
  });

  it("does not store a host that only appears after the 40-character cut", async () => {
    const res = await PUT(new Request("http://localhost/api/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: `${"A".repeat(31)} evil.comXYZ` }),
    }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: DISPLAY_NAME_ERROR });
    expect(edit).not.toHaveBeenCalled();
  });
});
