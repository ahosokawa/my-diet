const ALG = "AES-GCM";
const LEN = 256;
const IV_BYTES = 12;

export async function generateKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: ALG, length: LEN },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptPat(
  key: CryptoKey,
  pat: string
): Promise<{ iv: Uint8Array; ciphertext: Uint8Array }> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plain = new TextEncoder().encode(pat);
  const buf = await crypto.subtle.encrypt({ name: ALG, iv } as AesGcmParams, key, plain as BufferSource);
  return { iv, ciphertext: new Uint8Array(buf) };
}

export async function decryptPat(
  key: CryptoKey,
  iv: Uint8Array,
  ciphertext: Uint8Array
): Promise<string> {
  const buf = await crypto.subtle.decrypt({ name: ALG, iv } as AesGcmParams, key, ciphertext as BufferSource);
  return new TextDecoder().decode(buf);
}
