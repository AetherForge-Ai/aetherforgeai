/**
 * Resolve a polite, non-placeholder greeting / display name from session fields.
 * Prefer live session name / email local-part — never placeholder names like "Test".
 * Returns "" when nothing trustworthy is available so the UI can show a neutral greeting.
 */

const PLACEHOLDER_NAMES = new Set([
  "test",
  "tester",
  "user",
  "guest",
  "member",
  "aetherforge",
  "admin",
  "demo",
  "there",
]);

function isPlaceholder(value: string): boolean {
  return !value || PLACEHOLDER_NAMES.has(value.toLowerCase());
}

function firstWord(value: string): string {
  return value.trim().split(/\s+/)[0] || "";
}

function fromEmailLocal(email?: string | null): string {
  const local = (email || "").split("@")[0]?.trim() || "";
  if (!local || isPlaceholder(local)) return "";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

export function resolveGreetingName(user: {
  name?: string | null;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
} | null | undefined): string {
  if (!user) return "";

  const first = (user.first_name || "").trim();
  if (first && !isPlaceholder(first)) return firstWord(first);

  const full = `${(user.first_name || "").trim()} ${(user.last_name || "").trim()}`.trim();
  if (full) {
    const part = firstWord(full);
    if (part && !isPlaceholder(part)) return part;
  }

  const name = (user.name || "").trim();
  const fromName = firstWord(name);
  if (fromName && !isPlaceholder(fromName)) return fromName;

  return fromEmailLocal(user.email);
}

export function resolveDisplayName(user: {
  name?: string | null;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
} | null | undefined): string {
  if (!user) return "";
  const composed = `${(user.first_name || "").trim()} ${(user.last_name || "").trim()}`.trim();
  if (composed) {
    const part = firstWord(composed);
    if (part && !isPlaceholder(part)) return composed;
  }
  const name = (user.name || "").trim();
  if (name && !isPlaceholder(firstWord(name)) && !isPlaceholder(name)) return name;
  const greet = resolveGreetingName(user);
  return greet || fromEmailLocal(user.email) || "";
}
