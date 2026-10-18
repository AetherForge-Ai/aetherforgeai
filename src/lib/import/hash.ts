/**
 * Content hash for a broker file.
 * Line endings and a leading BOM are normalised so the same spreadsheet
 * saved on Windows or macOS is one file. First 16 hex characters of SHA-256.
 * Web Crypto only.
 */

export async function contentHash(text: string): Promise<string> {
  const normalised = String(text || "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalised));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

/** Batch id is the file hash, so undo and the duplicate check share one stamp. */
export function batchIdForHash(fileHash: string): string {
  return `imp${fileHash}`;
}
