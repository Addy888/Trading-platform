import { encrypt, decrypt, generateEncryptionKey } from './encryption.util';

describe('Encryption Utility', () => {
  const testKey = 'test-encryption-key-32-chars!!!!'; // Exactly 32 characters
  const testPlaintext = 'my-secret-session-token-12345';

  describe('encrypt', () => {
    it('should encrypt plaintext successfully', () => {
      const encrypted = encrypt(testPlaintext, testKey);

      expect(encrypted).toBeDefined();
      expect(encrypted).not.toBe(testPlaintext);
      expect(encrypted.split(':').length).toBe(4); // salt:iv:authTag:ciphertext
    });

    it('should produce different ciphertext for same plaintext (due to random salt/IV)', () => {
      const encrypted1 = encrypt(testPlaintext, testKey);
      const encrypted2 = encrypt(testPlaintext, testKey);

      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should throw error for empty plaintext', () => {
      expect(() => encrypt('', testKey)).toThrow('Cannot encrypt empty value');
    });

    it('should throw error for short encryption key', () => {
      expect(() => encrypt(testPlaintext, 'short')).toThrow('Encryption key must be at least 32 characters');
    });
  });

  describe('decrypt', () => {
    it('should decrypt encrypted data successfully', () => {
      const encrypted = encrypt(testPlaintext, testKey);
      const decrypted = decrypt(encrypted, testKey);

      expect(decrypted).toBe(testPlaintext);
    });

    it('should handle special characters', () => {
      const specialText = 'token!@#$%^&*()_+-=[]{}|;:,.<>?';
      const encrypted = encrypt(specialText, testKey);
      const decrypted = decrypt(encrypted, testKey);

      expect(decrypted).toBe(specialText);
    });

    it('should handle unicode characters', () => {
      const unicodeText = 'टोकन-令牌-トークン';
      const encrypted = encrypt(unicodeText, testKey);
      const decrypted = decrypt(encrypted, testKey);

      expect(decrypted).toBe(unicodeText);
    });

    it('should throw error for empty encrypted data', () => {
      expect(() => decrypt('', testKey)).toThrow('Cannot decrypt empty value');
    });

    it('should throw error for invalid format', () => {
      expect(() => decrypt('invalid-format', testKey)).toThrow('Invalid encrypted data format');
    });

    it('should throw error for wrong key', () => {
      const encrypted = encrypt(testPlaintext, testKey);
      const wrongKey = 'wrong-encryption-key-32-chars!!';

      expect(() => decrypt(encrypted, wrongKey)).toThrow();
    });

    it('should throw error for tampered ciphertext', () => {
      const encrypted = encrypt(testPlaintext, testKey);
      // Tamper with the auth tag (component 2) which will cause authentication to fail
      const parts = encrypted.split(':');
      parts[2] = Buffer.from('tampered-auth-tag!!').toString('base64');
      const tampered = parts.join(':');

      expect(() => decrypt(tampered, testKey)).toThrow();
    });
  });

  describe('generateEncryptionKey', () => {
    it('should generate a 32-character key', () => {
      const key = generateEncryptionKey();

      expect(key).toBeDefined();
      expect(key.length).toBe(32);
    });

    it('should generate different keys each time', () => {
      const key1 = generateEncryptionKey();
      const key2 = generateEncryptionKey();

      expect(key1).not.toBe(key2);
    });

    it('should generate keys that work for encryption', () => {
      const key = generateEncryptionKey();
      const encrypted = encrypt(testPlaintext, key);
      const decrypted = decrypt(encrypted, key);

      expect(decrypted).toBe(testPlaintext);
    });
  });

  describe('end-to-end encryption/decryption', () => {
    it('should handle large strings', () => {
      const largeText = 'a'.repeat(10000);
      const encrypted = encrypt(largeText, testKey);
      const decrypted = decrypt(encrypted, testKey);

      expect(decrypted).toBe(largeText);
    });

    it('should handle JSON strings', () => {
      const jsonText = JSON.stringify({
        token: 'abc123',
        expiry: '2024-12-31',
        metadata: { userId: '123', role: 'admin' },
      });

      const encrypted = encrypt(jsonText, testKey);
      const decrypted = decrypt(encrypted, testKey);
      const parsed = JSON.parse(decrypted);

      expect(parsed.token).toBe('abc123');
      expect(parsed.metadata.role).toBe('admin');
    });
  });
});
