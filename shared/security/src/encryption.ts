/**
 * AES-256 Encryption Module
 * Provides encryption at rest using AES-256-GCM (Galois/Counter Mode)
 * with secure key derivation and authenticated encryption
 */

import * as crypto from 'crypto';
import {
  EncryptionConfig,
  EncryptedData,
  EncryptionResult,
  DecryptionResult,
} from './types';

const DEFAULT_CONFIG: EncryptionConfig = {
  algorithm: 'aes-256-gcm',
  keyDerivationIterations: 100000,
  saltLength: 32,
  ivLength: 16,
  tagLength: 16,
  encoding: 'base64',
};

const ENCRYPTION_VERSION = 1;

export class EncryptionService {
  private config: EncryptionConfig;
  private masterKey?: Buffer;

  constructor(config: Partial<EncryptionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set the master encryption key
   * Should be loaded from KMS in production
   */
  setMasterKey(key: string | Buffer): void {
    if (typeof key === 'string') {
      this.masterKey = Buffer.from(key, 'hex');
    } else {
      this.masterKey = key;
    }

    if (this.masterKey.length !== 32) {
      throw new Error('Master key must be 256 bits (32 bytes)');
    }
  }

  /**
   * Derive an encryption key from a password using PBKDF2
   */
  deriveKey(password: string, salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(
      password,
      salt,
      this.config.keyDerivationIterations,
      32,
      'sha512'
    );
  }

  /**
   * Generate a random encryption key
   */
  generateKey(): Buffer {
    return crypto.randomBytes(32);
  }

  /**
   * Generate a random salt
   */
  generateSalt(): Buffer {
    return crypto.randomBytes(this.config.saltLength);
  }

  /**
   * Generate a random initialization vector
   */
  generateIV(): Buffer {
    return crypto.randomBytes(this.config.ivLength);
  }

  /**
   * Encrypt data using AES-256-GCM
   * @param plaintext - Data to encrypt (string or Buffer)
   * @param key - Optional encryption key (uses master key if not provided)
   * @param keyId - Optional key identifier for key rotation tracking
   */
  encrypt(
    plaintext: string | Buffer,
    key?: Buffer,
    keyId?: string
  ): EncryptionResult {
    try {
      const encryptionKey = key || this.masterKey;
      if (!encryptionKey) {
        return {
          success: false,
          error: 'No encryption key available. Set master key or provide a key.',
        };
      }

      const iv = this.generateIV();
      const cipher = crypto.createCipheriv(
        'aes-256-gcm',
        encryptionKey,
        iv,
        { authTagLength: this.config.tagLength }
      );

      const plaintextBuffer = Buffer.isBuffer(plaintext)
        ? plaintext
        : Buffer.from(plaintext, 'utf8');

      const ciphertext = Buffer.concat([
        cipher.update(plaintextBuffer),
        cipher.final(),
      ]);

      const tag = cipher.getAuthTag();

      const encryptedData: EncryptedData = {
        ciphertext: ciphertext.toString(this.config.encoding),
        iv: iv.toString(this.config.encoding),
        tag: tag.toString(this.config.encoding),
        algorithm: this.config.algorithm,
        keyId,
        version: ENCRYPTION_VERSION,
      };

      return {
        success: true,
        data: encryptedData,
      };
    } catch (error) {
      return {
        success: false,
        error: `Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Encrypt data with a password (derives key using PBKDF2)
   */
  encryptWithPassword(
    plaintext: string | Buffer,
    password: string
  ): EncryptionResult {
    try {
      const salt = this.generateSalt();
      const key = this.deriveKey(password, salt);

      const result = this.encrypt(plaintext, key);
      if (result.success && result.data) {
        result.data.salt = salt.toString(this.config.encoding);
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: `Password-based encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Decrypt data using AES-256-GCM
   */
  decrypt(
    encryptedData: EncryptedData,
    key?: Buffer
  ): DecryptionResult {
    try {
      const decryptionKey = key || this.masterKey;
      if (!decryptionKey) {
        return {
          success: false,
          error: 'No decryption key available. Set master key or provide a key.',
        };
      }

      if (encryptedData.algorithm !== 'aes-256-gcm') {
        return {
          success: false,
          error: `Unsupported algorithm: ${encryptedData.algorithm}`,
        };
      }

      const iv = Buffer.from(encryptedData.iv, this.config.encoding);
      const ciphertext = Buffer.from(
        encryptedData.ciphertext,
        this.config.encoding
      );
      const tag = encryptedData.tag
        ? Buffer.from(encryptedData.tag, this.config.encoding)
        : undefined;

      if (!tag) {
        return {
          success: false,
          error: 'Authentication tag is required for GCM mode',
        };
      }

      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        decryptionKey,
        iv,
        { authTagLength: this.config.tagLength }
      );

      decipher.setAuthTag(tag);

      const plaintext = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);

      return {
        success: true,
        plaintext: plaintext.toString('utf8'),
      };
    } catch (error) {
      return {
        success: false,
        error: `Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Decrypt data that was encrypted with a password
   */
  decryptWithPassword(
    encryptedData: EncryptedData,
    password: string
  ): DecryptionResult {
    try {
      if (!encryptedData.salt) {
        return {
          success: false,
          error: 'Salt is required for password-based decryption',
        };
      }

      const salt = Buffer.from(encryptedData.salt, this.config.encoding);
      const key = this.deriveKey(password, salt);

      return this.decrypt(encryptedData, key);
    } catch (error) {
      return {
        success: false,
        error: `Password-based decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Encrypt a file stream
   */
  createEncryptStream(key?: Buffer): {
    stream: crypto.CipherGCM;
    iv: Buffer;
    getTag: () => Buffer;
  } {
    const encryptionKey = key || this.masterKey;
    if (!encryptionKey) {
      throw new Error('No encryption key available');
    }

    const iv = this.generateIV();
    const cipher = crypto.createCipheriv(
      'aes-256-gcm',
      encryptionKey,
      iv,
      { authTagLength: this.config.tagLength }
    ) as crypto.CipherGCM;

    return {
      stream: cipher,
      iv,
      getTag: () => cipher.getAuthTag(),
    };
  }

  /**
   * Create a decryption stream
   */
  createDecryptStream(
    iv: Buffer,
    tag: Buffer,
    key?: Buffer
  ): crypto.DecipherGCM {
    const decryptionKey = key || this.masterKey;
    if (!decryptionKey) {
      throw new Error('No decryption key available');
    }

    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      decryptionKey,
      iv,
      { authTagLength: this.config.tagLength }
    ) as crypto.DecipherGCM;

    decipher.setAuthTag(tag);

    return decipher;
  }

  /**
   * Generate a secure hash of data
   */
  hash(data: string | Buffer, algorithm: 'sha256' | 'sha512' = 'sha256'): string {
    return crypto
      .createHash(algorithm)
      .update(data)
      .digest('hex');
  }

  /**
   * Generate an HMAC for data integrity
   */
  hmac(data: string | Buffer, key?: Buffer): string {
    const hmacKey = key || this.masterKey;
    if (!hmacKey) {
      throw new Error('No HMAC key available');
    }

    return crypto
      .createHmac('sha256', hmacKey)
      .update(data)
      .digest('hex');
  }

  /**
   * Verify HMAC
   */
  verifyHmac(data: string | Buffer, expectedHmac: string, key?: Buffer): boolean {
    const computedHmac = this.hmac(data, key);
    return crypto.timingSafeEqual(
      Buffer.from(computedHmac, 'hex'),
      Buffer.from(expectedHmac, 'hex')
    );
  }

  /**
   * Encrypt sensitive fields in an object
   */
  encryptFields(
    obj: Record<string, unknown>,
    fields: string[],
    key?: Buffer
  ): { data: Record<string, unknown>; encrypted: string[] } {
    const result: Record<string, unknown> = { ...obj };
    const encryptedFields: string[] = [];

    for (const field of fields) {
      if (field in result && result[field] !== null && result[field] !== undefined) {
        const value = String(result[field]);
        const encrypted = this.encrypt(value, key);
        if (encrypted.success && encrypted.data) {
          result[field] = encrypted.data;
          encryptedFields.push(field);
        }
      }
    }

    return { data: result, encrypted: encryptedFields };
  }

  /**
   * Decrypt sensitive fields in an object
   */
  decryptFields(
    obj: Record<string, unknown>,
    fields: string[],
    key?: Buffer
  ): { data: Record<string, unknown>; decrypted: string[] } {
    const result: Record<string, unknown> = { ...obj };
    const decryptedFields: string[] = [];

    for (const field of fields) {
      if (field in result && this.isEncryptedData(result[field])) {
        const decrypted = this.decrypt(result[field] as EncryptedData, key);
        if (decrypted.success) {
          result[field] = decrypted.plaintext;
          decryptedFields.push(field);
        }
      }
    }

    return { data: result, decrypted: decryptedFields };
  }

  /**
   * Check if data is encrypted data structure
   */
  private isEncryptedData(data: unknown): data is EncryptedData {
    return (
      typeof data === 'object' &&
      data !== null &&
      'ciphertext' in data &&
      'iv' in data &&
      'algorithm' in data &&
      'version' in data
    );
  }

  /**
   * Securely compare two strings (constant time)
   */
  secureCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }

  /**
   * Generate a cryptographically secure random string
   */
  generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Wrap a data encryption key (DEK) with a key encryption key (KEK)
   */
  wrapKey(dek: Buffer, kek: Buffer): EncryptionResult {
    return this.encrypt(dek, kek);
  }

  /**
   * Unwrap a data encryption key
   */
  unwrapKey(wrappedKey: EncryptedData, kek: Buffer): Buffer | null {
    const result = this.decrypt(wrappedKey, kek);
    if (result.success && result.plaintext) {
      return Buffer.from(result.plaintext as string, 'utf8');
    }
    return null;
  }
}

// Singleton instance for convenience
let defaultInstance: EncryptionService | null = null;

export function getEncryptionService(config?: Partial<EncryptionConfig>): EncryptionService {
  if (!defaultInstance || config) {
    defaultInstance = new EncryptionService(config);
  }
  return defaultInstance;
}

export default EncryptionService;
