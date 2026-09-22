/**
 * Resolve a polite, non-placeholder greeting / display name from session fields.
 * Prefer first name (or full display name), else email local-part — never "Test".
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
]);

export function resolveGreetingName(user: {
  name?: string | null;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}): string {
  const first = (user.first_name || "").trim();
  if (first && !PLACEHOLDER_NAMES.has(first.toLowerCase())) return first;

  const full = `${(user.first_name || "").trim()} ${(user.last_name || "").trim()}`.trim();
  if (full) {
    const part = full.split(/\s+/)[0]!;
    if (!PLACEHOLDER_NAMES.has(part.toLowerCase())) return part;
  }

  const name = (user.name || "").trim();
  const fromName = name.split(/\s+/)[0] || "";
  if (fromName && !PLACEHOLDER_NAMES.has(fromName.toLowerCase())) return fromName;

  const local = (user.email || "").split("@")[0]?.trim() || "";
  if (local) {
    // Capitalise first letter of local-part for a friendlier greeting.
    return local.charAt(0).toUpperCase() + local.slice(1);
  }

  return "there";
}

export function resolveDisplayName(user: {
  name?: string | null;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}): string {
  const composed = `${(user.first_name || "").trim()} ${(user.last_name || "").trim()}`.trim();
  if (composed) return composed;
  const name = (user.name || "").trim();
  if (name && !PLACEHOLDER_NAMES.has(name.toLowerCase())) return name;
  return resolveGreetingName(user);
}
