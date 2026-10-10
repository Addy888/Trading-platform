import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

/**
 * Encryption utility for securing broker credentials and tokens
 * Uses AES-256-GCM for authenticated encryption
 */

const ALGORITHM = 'aes-256-gcm';
const SALT_LENGTH = 16;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Derives a cryptographic key from the encryption key string
 */
function deriveKey(encryptionKey: string, salt: Buffer): Buffer {
  return scryptSync(encryptionKey, salt, KEY_LENGTH);
}

/**
 * Encrypts a plaintext string
 * @param plaintext - The text to encrypt
 * @param encryptionKey - Base encryption key from environment
 * @returns Encrypted string in format: salt:iv:authTag:ciphertext (all base64)
 */
export function encrypt(plaintext: string, encryptionKey: string): string {
  if (!plaintext) {
    throw new Error('Cannot encrypt empty value');
  }

  if (!encryptionKey || encryptionKey.length < 32) {
    throw new Error('Encryption key must be at least 32 characters');
  }

  // Generate random salt and IV for this encryption
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);

  // Derive key from encryption key + salt
  const key = deriveKey(encryptionKey, salt);

  // Create cipher
  const cipher = createCipheriv(ALGORITHM, key, iv);

  // Encrypt
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  // Get authentication tag
  const authTag = cipher.getAuthTag();

  // Return format: salt:iv:authTag:ciphertext
  return [
    salt.toString('base64'),
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted,
  ].join(':');
}

/**
 * Decrypts an encrypted string
 * @param encryptedData - Encrypted string in format: salt:iv:authTag:ciphertext
 * @param encryptionKey - Base encryption key from environment
 * @returns Decrypted plaintext
 */
export function decrypt(encryptedData: string, encryptionKey: string): string {
  if (!encryptedData) {
    throw new Error('Cannot decrypt empty value');
  }

  if (!encryptionKey || encryptionKey.length < 32) {
    throw new Error('Encryption key must be at least 32 characters');
  }

  // Parse the encrypted data
  const parts = encryptedData.split(':');
  if (parts.length !== 4) {
    throw new Error('Invalid encrypted data format');
  }

  const [saltB64, ivB64, authTagB64, ciphertext] = parts;

  const salt = Buffer.from(saltB64, 'base64');
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');

  // Derive key
  const key = deriveKey(encryptionKey, salt);

  // Create decipher
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  // Decrypt
  let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Generates a random encryption key suitable for use as ANGELONE_ENCRYPTION_KEY
 * @returns A 32-character random string
 */
export function generateEncryptionKey(): string {
  return randomBytes(32).toString('base64').substring(0, 32);
}
