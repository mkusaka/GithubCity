import { decodeBase64Url, encodeBase64Url } from "hono/utils/encode";

async function deriveKey(secret: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

// Encrypts the GitHub token so the session cookie never holds it in plaintext.
export async function seal(token: string, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await deriveKey(secret),
    new TextEncoder().encode(token),
  );
  const sealed = new Uint8Array(iv.length + ciphertext.byteLength);
  sealed.set(iv);
  sealed.set(new Uint8Array(ciphertext), iv.length);
  return encodeBase64Url(sealed.buffer);
}

export async function unseal(sealed: string, secret: string) {
  try {
    const bytes = decodeBase64Url(sealed);
    const token = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.slice(0, 12) },
      await deriveKey(secret),
      bytes.slice(12),
    );
    return new TextDecoder().decode(token);
  } catch {
    return null;
  }
}
