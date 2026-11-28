import { describe, expect, it } from "vitest";
import { resolveDisplayName, resolveGreetingName } from "@/lib/user-display";

describe("resolveGreetingName", () => {
  it("prefers a saved settings name over the email local-part", () => {
    const user = {
      first_name: "Test",
      last_name: "UserAF",
      name: "Rexopic979",
      email: "rexopic979@example.com",
    };
    expect(resolveGreetingName(user)).toBe("Test UserAF");
    expect(resolveDisplayName(user)).toBe("Test UserAF");
  });

  it("greets with the first name when that word is a real name", () => {
    const user = { first_name: "Jane", last_name: "Doe", name: "Rexopic979", email: "rexopic979@example.com" };
    expect(resolveGreetingName(user)).toBe("Jane");
    expect(resolveDisplayName(user)).toBe("Jane Doe");
  });

  it("does not greet with a bare placeholder", () => {
    const user = { first_name: "Test", last_name: "", name: "Test", email: "rexopic979@example.com" };
    expect(resolveGreetingName(user)).toBe("Rexopic979");
    expect(resolveDisplayName(user)).toBe("Rexopic979");
  });

  it("skips a settings name made only of placeholder words", () => {
    const user = { first_name: "Test", last_name: "User", name: "Test User", email: "ada@example.com" };
    expect(resolveGreetingName(user)).toBe("Ada");
    expect(resolveDisplayName(user)).toBe("Ada");
  });

  it("uses a distinctive session name when settings fields are empty", () => {
    expect(resolveGreetingName({ name: "Aroha Ngata", email: "aroha@example.com" })).toBe("Aroha");
    expect(resolveDisplayName({ name: "Aroha Ngata", email: "aroha@example.com" })).toBe("Aroha Ngata");
  });

  it("does not greet a QA label on a new account", () => {
    expect(resolveGreetingName({ name: "QA", email: "qa@example.com" })).toBe("");
    expect(resolveDisplayName({ name: "QA", email: "qa@example.com" })).toBe("");
  });

  it("returns empty when nothing trustworthy is available", () => {
    expect(resolveGreetingName(null)).toBe("");
    expect(resolveDisplayName({ name: "Test", email: "" })).toBe("");
  });

  it("does not greet with a display name that is a phishing lure", () => {
    const user = {
      name: "AetherForge has moved to evil-site.com, log in there",
      email: "ada@example.com",
    };
    expect(resolveDisplayName(user)).toBe("Member");
    expect(resolveGreetingName(user)).toBe("Member");
    expect(resolveDisplayName({ name: "evil.com", email: "ada@example.com" })).toBe("Member");
    expect(resolveDisplayName({ name: "Seán O'Brien-Ngata", email: "ada@example.com" })).toBe("Seán O'Brien-Ngata");
  });
});
