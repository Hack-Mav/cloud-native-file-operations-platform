/**
 * Encryption Service Tests
 * Tests for AES-256-GCM encryption, key derivation, and data protection
 */

import { EncryptionService, getEncryptionService } from '../src/encryption';
import * as crypto from 'crypto';

describe('EncryptionService', () => {
  let encryptionService: EncryptionService;

  beforeEach(() => {
    encryptionService = new EncryptionService();
    // Set a test master key
    const testKey = crypto.randomBytes(32);
    encryptionService.setMasterKey(testKey);
  });

  describe('Key Generation', () => {
    it('should generate a 256-bit (32 byte) encryption key', () => {
      const key = encryptionService.generateKey();
      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32);
    });

    it('should generate unique keys each time', () => {
      const key1 = encryptionService.generateKey();
      const key2 = encryptionService.generateKey();
      expect(key1.equals(key2)).toBe(false);
    });

    it('should generate a random salt with correct length', () => {
      const salt = encryptionService.generateSalt();
      expect(salt).toBeInstanceOf(Buffer);
      expect(salt.length).toBe(32);
    });

    it('should generate a random IV with correct length', () => {
      const iv = encryptionService.generateIV();
      expect(iv).toBeInstanceOf(Buffer);
      expect(iv.length).toBe(16);
    });
  });

  describe('Key Derivation', () => {
    it('should derive a 256-bit key from password', () => {
      const password = 'secure-password-123';
      const salt = encryptionService.generateSalt();
      const derivedKey = encryptionService.deriveKey(password, salt);

      expect(derivedKey).toBeInstanceOf(Buffer);
      expect(derivedKey.length).toBe(32);
    });

    it('should derive the same key for same password and salt', () => {
      const password = 'test-password';
      const salt = encryptionService.generateSalt();

      const key1 = encryptionService.deriveKey(password, salt);
      const key2 = encryptionService.deriveKey(password, salt);

      expect(key1.equals(key2)).toBe(true);
    });

    it('should derive different keys for different salts', () => {
      const password = 'test-password';
      const salt1 = encryptionService.generateSalt();
      const salt2 = encryptionService.generateSalt();

      const key1 = encryptionService.deriveKey(password, salt1);
      const key2 = encryptionService.deriveKey(password, salt2);

      expect(key1.equals(key2)).toBe(false);
    });
  });

  describe('Encryption and Decryption', () => {
    it('should encrypt and decrypt a string successfully', () => {
      const plaintext = 'Hello, World! This is a secret message.';

      const encrypted = encryptionService.encrypt(plaintext);
      expect(encrypted.success).toBe(true);
      expect(encrypted.data).toBeDefined();
      expect(encrypted.data!.ciphertext).not.toBe(plaintext);
      expect(encrypted.data!.algorithm).toBe('aes-256-gcm');

      const decrypted = encryptionService.decrypt(encrypted.data!);
      expect(decrypted.success).toBe(true);
      expect(decrypted.plaintext).toBe(plaintext);
    });

    it('should encrypt and decrypt a Buffer successfully', () => {
      const plaintext = Buffer.from('Binary data: \x00\x01\x02\x03');

      const encrypted = encryptionService.encrypt(plaintext);
      expect(encrypted.success).toBe(true);

      const decrypted = encryptionService.decrypt(encrypted.data!);
      expect(decrypted.success).toBe(true);
    });

    it('should produce different ciphertext for same plaintext (due to random IV)', () => {
      const plaintext = 'Same message';

      const encrypted1 = encryptionService.encrypt(plaintext);
      const encrypted2 = encryptionService.encrypt(plaintext);

      expect(encrypted1.data!.ciphertext).not.toBe(encrypted2.data!.ciphertext);
      expect(encrypted1.data!.iv).not.toBe(encrypted2.data!.iv);
    });

    it('should fail decryption with wrong key', () => {
      const plaintext = 'Secret message';
      const encrypted = encryptionService.encrypt(plaintext);

      const wrongKey = crypto.randomBytes(32);
      const decrypted = encryptionService.decrypt(encrypted.data!, wrongKey);

      expect(decrypted.success).toBe(false);
      expect(decrypted.error).toBeDefined();
    });

    it('should fail decryption with tampered ciphertext', () => {
      const plaintext = 'Secret message';
      const encrypted = encryptionService.encrypt(plaintext);

      // Tamper with the ciphertext
      const tamperedData = { ...encrypted.data! };
      tamperedData.ciphertext = tamperedData.ciphertext.slice(0, -4) + 'XXXX';

      const decrypted = encryptionService.decrypt(tamperedData);
      expect(decrypted.success).toBe(false);
    });

    it('should fail decryption with tampered auth tag', () => {
      const plaintext = 'Secret message';
      const encrypted = encryptionService.encrypt(plaintext);

      // Tamper with the auth tag
      const tamperedData = { ...encrypted.data! };
      tamperedData.tag = tamperedData.tag!.slice(0, -4) + 'XXXX';

      const decrypted = encryptionService.decrypt(tamperedData);
      expect(decrypted.success).toBe(false);
    });

    it('should fail without encryption key', () => {
      const service = new EncryptionService();
      const result = service.encrypt('test');

      expect(result.success).toBe(false);
      expect(result.error).toContain('No encryption key available');
    });
  });

  describe('Password-based Encryption', () => {
    it('should encrypt and decrypt with password', () => {
      const plaintext = 'Password protected data';
      const password = 'strong-password-123!';

      const encrypted = encryptionService.encryptWithPassword(plaintext, password);
      expect(encrypted.success).toBe(true);
      expect(encrypted.data!.salt).toBeDefined();

      const decrypted = encryptionService.decryptWithPassword(encrypted.data!, password);
      expect(decrypted.success).toBe(true);
      expect(decrypted.plaintext).toBe(plaintext);
    });

    it('should fail decryption with wrong password', () => {
      const plaintext = 'Secret data';
      const password = 'correct-password';
      const wrongPassword = 'wrong-password';

      const encrypted = encryptionService.encryptWithPassword(plaintext, password);
      const decrypted = encryptionService.decryptWithPassword(encrypted.data!, wrongPassword);

      expect(decrypted.success).toBe(false);
    });
  });

  describe('HMAC', () => {
    it('should generate consistent HMAC for same data', () => {
      const data = 'Data to authenticate';

      const hmac1 = encryptionService.hmac(data);
      const hmac2 = encryptionService.hmac(data);

      expect(hmac1).toBe(hmac2);
    });

    it('should generate different HMAC for different data', () => {
      const hmac1 = encryptionService.hmac('Data 1');
      const hmac2 = encryptionService.hmac('Data 2');

      expect(hmac1).not.toBe(hmac2);
    });

    it('should verify HMAC correctly', () => {
      const data = 'Data to verify';
      const hmac = encryptionService.hmac(data);

      expect(encryptionService.verifyHmac(data, hmac)).toBe(true);
      expect(encryptionService.verifyHmac('Different data', hmac)).toBe(false);
    });
  });

  describe('Hashing', () => {
    it('should generate SHA-256 hash', () => {
      const data = 'Data to hash';
      const hash = encryptionService.hash(data, 'sha256');

      expect(hash).toHaveLength(64); // SHA-256 = 256 bits = 64 hex chars
    });

    it('should generate SHA-512 hash', () => {
      const data = 'Data to hash';
      const hash = encryptionService.hash(data, 'sha512');

      expect(hash).toHaveLength(128); // SHA-512 = 512 bits = 128 hex chars
    });

    it('should generate consistent hash for same data', () => {
      const data = 'Consistent data';

      const hash1 = encryptionService.hash(data);
      const hash2 = encryptionService.hash(data);

      expect(hash1).toBe(hash2);
    });
  });

  describe('Field Encryption', () => {
    it('should encrypt specified fields in an object', () => {
      const obj = {
        name: 'John Doe',
        email: 'john@example.com',
        ssn: '123-45-6789',
        publicInfo: 'Not sensitive',
      };

      const { data, encrypted } = encryptionService.encryptFields(obj, ['ssn', 'email']);

      expect(encrypted).toContain('ssn');
      expect(encrypted).toContain('email');
      expect(encrypted).not.toContain('name');
      expect(data.name).toBe('John Doe');
      expect(data.publicInfo).toBe('Not sensitive');
      expect(data.ssn).not.toBe('123-45-6789');
    });

    it('should decrypt specified fields in an object', () => {
      const obj = {
        name: 'John Doe',
        ssn: '123-45-6789',
      };

      const { data: encryptedObj } = encryptionService.encryptFields(obj, ['ssn']);
      const { data: decryptedObj } = encryptionService.decryptFields(encryptedObj, ['ssn']);

      expect(decryptedObj.name).toBe('John Doe');
      expect(decryptedObj.ssn).toBe('123-45-6789');
    });
  });

  describe('Secure Token Generation', () => {
    it('should generate secure tokens of specified length', () => {
      const token = encryptionService.generateSecureToken(32);

      expect(token).toHaveLength(64); // 32 bytes = 64 hex chars
    });

    it('should generate unique tokens', () => {
      const token1 = encryptionService.generateSecureToken();
      const token2 = encryptionService.generateSecureToken();

      expect(token1).not.toBe(token2);
    });
  });

  describe('Key Wrapping', () => {
    it('should wrap and unwrap a data encryption key', () => {
      const dek = encryptionService.generateKey();
      const kek = encryptionService.generateKey();

      const wrapped = encryptionService.wrapKey(dek, kek);
      expect(wrapped.success).toBe(true);

      const unwrapped = encryptionService.unwrapKey(wrapped.data!, kek);
      expect(unwrapped).not.toBeNull();
    });
  });

  describe('Secure Comparison', () => {
    it('should return true for equal strings', () => {
      expect(encryptionService.secureCompare('secret', 'secret')).toBe(true);
    });

    it('should return false for different strings', () => {
      expect(encryptionService.secureCompare('secret', 'different')).toBe(false);
    });

    it('should return false for different length strings', () => {
      expect(encryptionService.secureCompare('short', 'longer-string')).toBe(false);
    });
  });

  describe('Singleton Instance', () => {
    it('should return the same instance by default', () => {
      const instance1 = getEncryptionService();
      const instance2 = getEncryptionService();

      expect(instance1).toBe(instance2);
    });

    it('should create new instance with config', () => {
      const instance = getEncryptionService({ keyDerivationIterations: 50000 });
      expect(instance).toBeDefined();
    });
  });
});
