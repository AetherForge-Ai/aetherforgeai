/**
 * Resolve a greeting and a display name from session + settings fields.
 * A saved profile (Settings first/last name, or the full name field) wins over
 * the email local-part. A label made only of placeholder words ("Test", "User")
 * is skipped. A distinctive settings name such as "Test UserAF" is kept whole
 * when its first word would otherwise look like a placeholder.
 * Returns "" when nothing trustworthy is available so the UI can stay neutral.
 */

import { sanitizeDisplayName } from "@/lib/display-name";

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
  "qa",
]);

export type NameSource = {
  name?: string | null;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
} | null | undefined;

function isPlaceholderWord(value: string): boolean {
  return PLACEHOLDER_NAMES.has(value.toLowerCase());
}

function wordsOf(value: string): string[] {
  return value.trim().split(/\s+/).filter(Boolean);
}

function firstWord(value: string): string {
  return wordsOf(value)[0] || "";
}

/**
 * Keep a name when at least one word is not a placeholder.
 * "Test" and "Test User" are empty. "Test UserAF" and "Jane Doe" are kept.
 */
function distinctiveName(value: string): string {
  const words = wordsOf(value);
  if (words.length === 0) return "";
  if (words.every((word) => isPlaceholderWord(word))) return "";
  return words.join(" ");
}

/** Keep a cleaned lure ("Member", or the name with the URL removed) even when that label is a placeholder word. */
function presentDistinctive(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  const safe = sanitizeDisplayName(trimmed);
  if (safe !== trimmed) return safe;
  return distinctiveName(trimmed);
}

function fromEmailLocal(email?: string | null): string {
  const local = (email || "").split("@")[0]?.trim() || "";
  if (!local || isPlaceholderWord(local)) return "";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

/**
 * Settings first + last name, then the session name field.
 * Email is not consulted here.
 */
export function resolveSettingsDisplayName(user: NameSource): string {
  if (!user) return "";
  const composed = `${(user.first_name || "").trim()} ${(user.last_name || "").trim()}`.trim();
  const fromSettings = composed ? presentDistinctive(composed) : "";
  if (fromSettings) return fromSettings;
  return presentDistinctive((user.name || "").trim());
}

export function resolveGreetingName(user: NameSource): string {
  const display = resolveSettingsDisplayName(user);
  if (display) {
    const first = firstWord(display);
    // Bare "Test" was rejected on purpose. "Test UserAF" is the name they saved.
    if (first && isPlaceholderWord(first)) return display;
    return first;
  }
  const emailName = fromEmailLocal(user?.email);
  if (!emailName) return "";
  const safe = sanitizeDisplayName(emailName);
  if (safe !== emailName) return safe;
  if (isPlaceholderWord(safe)) return "";
  return safe;
}

export function resolveDisplayName(user: NameSource): string {
  const display = resolveSettingsDisplayName(user);
  if (display) return display;
  const emailName = fromEmailLocal(user?.email);
  if (!emailName) return "";
  const safe = sanitizeDisplayName(emailName);
  if (safe !== emailName) return safe;
  if (isPlaceholderWord(safe)) return "";
  return safe;
}
