/** One size cap, checked before a file is parsed. */

export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;

export const IMPORT_TOO_LARGE =
  "That file is larger than 5 MB. Split it into smaller files and import each one. Nothing was written.";

export function textTooLarge(text: string): boolean {
  if (text.length > IMPORT_MAX_BYTES) return true;
  return new TextEncoder().encode(text).length > IMPORT_MAX_BYTES;
}

export function bytesTooLarge(size: number): boolean {
  return size > IMPORT_MAX_BYTES;
}
