import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

/**
 * Encrypts provider credentials (Twilio Auth Tokens, etc.) before they're
 * ever written to Supabase. Requires CREDENTIAL_ENCRYPTION_KEY — a 32-byte
 * key, base64-encoded — set only in server environment variables, never
 * exposed to the client. Generate one with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *
 * Uses AES-256-GCM (authenticated encryption): the returned string bundles
 * iv:authTag:ciphertext so decryptSecret() can verify the data hasn't been
 * tampered with, not just decrypt it.
 */
function getKey(): Buffer {
  const keyB64 = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!keyB64) throw new Error('CREDENTIAL_ENCRYPTION_KEY is not configured');
  const key = Buffer.from(keyB64, 'base64');
  if (key.length !== 32) {
    throw new Error('CREDENTIAL_ENCRYPTION_KEY must decode to exactly 32 bytes');
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12); // recommended IV length for GCM
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptSecret(stored: string): string {
  const key = getKey();
  const [ivB64, authTagB64, dataB64] = stored.split(':');
  if (!ivB64 || !authTagB64 || !dataB64) {
    throw new Error('Malformed encrypted credential');
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
  return decrypted.toString('utf8');
}

/** Redacts a secret for logging — never log encryptSecret's input or
 * decryptSecret's output directly. */
export function redact(value: string | undefined | null): string {
  if (!value) return '(empty)';
  if (value.length <= 8) return '***';
  return `${value.slice(0, 4)}…${value.slice(-2)}`;
}
