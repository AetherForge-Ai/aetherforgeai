/**
 * Same-origin relative path only. Rejects open redirects
 * (https://evil.example, //evil.example, /\evil.example, and encoded forms).
 */

export function safeRelativeRedirect(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const value = raw.trim();
  if (!value || value.length > 512) return null;
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (!isRelativePath(decoded)) return null;
  return decoded;
}

function isRelativePath(value: string): boolean {
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//") || value.startsWith("/\\")) return false;
  if (value.includes("\\") || value.includes("://") || value.includes("@")) return false;
  if (/[\u0000-\u001f\s]/.test(value)) return false;
  return true;
}

/** Login lands on the dashboard unless a safe in-app path was requested. */
export function postLoginPath(raw: string | null | undefined): string {
  return safeRelativeRedirect(raw) || "/dashboard";
}
