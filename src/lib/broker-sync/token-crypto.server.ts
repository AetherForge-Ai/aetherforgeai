import "server-only";

/**
 * Broker sync: AES-256-GCM for broker tokens at rest. The key is BROKER_TOKEN_KEY
 * (32 bytes, base64). If it is missing or wrong, every call fails closed with
 * BROKER_KEY_MISSING; a token is never stored in clear. Output: "v1.<iv b64>.<ct b64>".
 * The user id is bound as additional data, so a ciphertext copied to another row fails.
 */
export const BROKER_KEY_MISSING =
  "Broker connections are switched off: the server's encryption key is not set. Nothing was saved.";

function b64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}
function unb64(text: string): Uint8Array {
  return new Uint8Array(Buffer.from(text, "base64"));
}

async function key(env: Record<string, string | undefined> = process.env): Promise<CryptoKey> {
  const raw = String(env.BROKER_TOKEN_KEY || "").trim();
  if (!raw) throw new Error(BROKER_KEY_MISSING);
  const bytes = unb64(raw);
  if (bytes.length !== 32) throw new Error(BROKER_KEY_MISSING);
  return crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export function brokerKeyConfigured(env: Record<string, string | undefined> = process.env): boolean {
  const raw = String(env.BROKER_TOKEN_KEY || "").trim();
  try {
    return !!raw && unb64(raw).length === 32;
  } catch {
    return false;
  }
}

export async function encryptToken(plain: string, userId: string, env?: Record<string, string | undefined>): Promise<string> {
  const k = await key(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(userId) },
    k,
    new TextEncoder().encode(plain)
  );
  return `v1.${b64(iv)}.${b64(new Uint8Array(ct))}`;
}

export async function decryptToken(sealed: string, userId: string, env?: Record<string, string | undefined>): Promise<string> {
  const k = await key(env);
  const [v, ivText, ctText] = String(sealed || "").split(".");
  if (v !== "v1" || !ivText || !ctText) throw new Error("The stored broker token could not be read. Connect again.");
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64(ivText), additionalData: new TextEncoder().encode(userId) },
      k,
      unb64(ctText)
    );
    return new TextDecoder().decode(plain);
  } catch {
    throw new Error("The stored broker token could not be read. Connect again.");
  }
}
