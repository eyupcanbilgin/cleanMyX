import crypto from "node:crypto";

export type EncryptedPayload = {
  iv: string; // base64
  authTag: string; // base64
  ciphertext: string; // base64
};

export function parseBase64Key32(keyBase64: string): Buffer {
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== 32) {
    throw new Error("TOKEN_ENC_KEY must be 32 bytes (base64-encoded)");
  }
  return key;
}

export function encryptString(opts: {
  plaintext: string;
  keyBase64: string;
  aad?: string;
}): EncryptedPayload {
  const key = parseBase64Key32(opts.keyBase64);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  if (opts.aad) cipher.setAAD(Buffer.from(opts.aad, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(opts.plaintext, "utf8")),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export function decryptString(opts: {
  payload: EncryptedPayload;
  keyBase64: string;
  aad?: string;
}): string {
  const key = parseBase64Key32(opts.keyBase64);
  const iv = Buffer.from(opts.payload.iv, "base64");
  const authTag = Buffer.from(opts.payload.authTag, "base64");
  const ciphertext = Buffer.from(opts.payload.ciphertext, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  if (opts.aad) decipher.setAAD(Buffer.from(opts.aad, "utf8"));
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

