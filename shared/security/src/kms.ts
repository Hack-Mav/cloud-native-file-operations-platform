/**
 * Google Cloud KMS Integration Module
 * Provides key management, encryption/decryption using Cloud KMS,
 * and key rotation capabilities
 */

import { KeyManagementServiceClient } from '@google-cloud/kms';
import * as crypto from 'crypto';
import {
  KMSConfig,
  KMSKeyMetadata,
  KMSEncryptResult,
  KMSDecryptResult,
} from './types';

interface KeyCache {
  key: Buffer;
  version: string;
  expiresAt: Date;
}

export class KMSService {
  private client: KeyManagementServiceClient;
  private config: KMSConfig;
  private keyCache: Map<string, KeyCache>;
  private cacheTimeout: number;

  constructor(config: KMSConfig, cacheTimeoutMinutes: number = 60) {
    this.client = new KeyManagementServiceClient();
    this.config = config;
    this.keyCache = new Map();
    this.cacheTimeout = cacheTimeoutMinutes * 60 * 1000;
  }

  /**
   * Get the full resource name for a crypto key
   */
  private getCryptoKeyName(): string {
    return this.client.cryptoKeyPath(
      this.config.projectId,
      this.config.locationId,
      this.config.keyRingId,
      this.config.cryptoKeyId
    );
  }

  /**
   * Get the full resource name for a crypto key version
   */
  private getCryptoKeyVersionName(version?: string): string {
    const keyVersion = version || this.config.cryptoKeyVersion || '1';
    return this.client.cryptoKeyVersionPath(
      this.config.projectId,
      this.config.locationId,
      this.config.keyRingId,
      this.config.cryptoKeyId,
      keyVersion
    );
  }

  /**
   * Encrypt data using Cloud KMS
   */
  async encrypt(plaintext: string | Buffer): Promise<KMSEncryptResult> {
    try {
      const plaintextBuffer = Buffer.isBuffer(plaintext)
        ? plaintext
        : Buffer.from(plaintext, 'utf8');

      const [encryptResponse] = await this.client.encrypt({
        name: this.getCryptoKeyName(),
        plaintext: plaintextBuffer,
      });

      if (!encryptResponse.ciphertext) {
        return {
          success: false,
          error: 'KMS encryption returned no ciphertext',
        };
      }

      const ciphertext = Buffer.isBuffer(encryptResponse.ciphertext)
        ? encryptResponse.ciphertext.toString('base64')
        : Buffer.from(encryptResponse.ciphertext).toString('base64');

      return {
        success: true,
        ciphertext,
        keyVersion: encryptResponse.name?.split('/').pop(),
      };
    } catch (error) {
      return {
        success: false,
        error: `KMS encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Decrypt data using Cloud KMS
   */
  async decrypt(ciphertext: string): Promise<KMSDecryptResult> {
    try {
      const ciphertextBuffer = Buffer.from(ciphertext, 'base64');

      const [decryptResponse] = await this.client.decrypt({
        name: this.getCryptoKeyName(),
        ciphertext: ciphertextBuffer,
      });

      if (!decryptResponse.plaintext) {
        return {
          success: false,
          error: 'KMS decryption returned no plaintext',
        };
      }

      const plaintext = Buffer.isBuffer(decryptResponse.plaintext)
        ? decryptResponse.plaintext
        : Buffer.from(decryptResponse.plaintext);

      return {
        success: true,
        plaintext,
      };
    } catch (error) {
      return {
        success: false,
        error: `KMS decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Generate a new data encryption key (DEK) using Cloud KMS
   * The DEK is encrypted with the KEK stored in Cloud KMS
   */
  async generateDataKey(): Promise<{
    success: boolean;
    plaintext?: Buffer;
    encryptedKey?: string;
    error?: string;
  }> {
    try {
      // Generate a 256-bit key locally
      const plaintext = crypto.randomBytes(32);

      // Encrypt it with KMS
      const encrypted = await this.encrypt(plaintext);

      if (!encrypted.success) {
        return {
          success: false,
          error: encrypted.error,
        };
      }

      return {
        success: true,
        plaintext,
        encryptedKey: encrypted.ciphertext,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to generate data key: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Decrypt a data encryption key
   */
  async decryptDataKey(encryptedKey: string): Promise<{
    success: boolean;
    key?: Buffer;
    error?: string;
  }> {
    const cacheKey = this.hashKey(encryptedKey);
    const cached = this.keyCache.get(cacheKey);

    if (cached && cached.expiresAt > new Date()) {
      return {
        success: true,
        key: cached.key,
      };
    }

    const result = await this.decrypt(encryptedKey);

    if (result.success && result.plaintext) {
      const key = Buffer.isBuffer(result.plaintext)
        ? result.plaintext
        : Buffer.from(result.plaintext);

      // Cache the key
      this.keyCache.set(cacheKey, {
        key,
        version: '1',
        expiresAt: new Date(Date.now() + this.cacheTimeout),
      });

      return {
        success: true,
        key,
      };
    }

    return {
      success: false,
      error: result.error,
    };
  }

  /**
   * Get key metadata
   */
  async getKeyMetadata(): Promise<KMSKeyMetadata | null> {
    try {
      const [key] = await this.client.getCryptoKey({
        name: this.getCryptoKeyName(),
      });

      if (!key) {
        return null;
      }

      return {
        keyId: key.name?.split('/').pop() || '',
        keyRingId: this.config.keyRingId,
        projectId: this.config.projectId,
        algorithm: key.versionTemplate?.algorithm || 'GOOGLE_SYMMETRIC_ENCRYPTION',
        purpose: key.purpose || 'ENCRYPT_DECRYPT',
        state: key.primary?.state || 'ENABLED',
        createTime: key.createTime?.seconds
          ? new Date(Number(key.createTime.seconds) * 1000).toISOString()
          : '',
        rotationPeriod: key.rotationPeriod?.seconds
          ? `${Number(key.rotationPeriod.seconds)}s`
          : undefined,
        nextRotationTime: key.nextRotationTime?.seconds
          ? new Date(Number(key.nextRotationTime.seconds) * 1000).toISOString()
          : undefined,
      };
    } catch (error) {
      console.error('Failed to get key metadata:', error);
      return null;
    }
  }

  /**
   * Create a new key ring if it doesn't exist
   */
  async createKeyRing(keyRingId?: string): Promise<boolean> {
    try {
      const ringId = keyRingId || this.config.keyRingId;
      const parent = `projects/${this.config.projectId}/locations/${this.config.locationId}`;

      await this.client.createKeyRing({
        parent,
        keyRingId: ringId,
        keyRing: {},
      });

      return true;
    } catch (error) {
      // Key ring might already exist
      if ((error as Error).message?.includes('ALREADY_EXISTS')) {
        return true;
      }
      console.error('Failed to create key ring:', error);
      return false;
    }
  }

  /**
   * Create a new crypto key
   */
  async createCryptoKey(
    cryptoKeyId?: string,
    rotationPeriodDays?: number
  ): Promise<boolean> {
    try {
      const keyId = cryptoKeyId || this.config.cryptoKeyId;
      const parent = this.client.keyRingPath(
        this.config.projectId,
        this.config.locationId,
        this.config.keyRingId
      );

      const cryptoKey: Record<string, unknown> = {
        purpose: 'ENCRYPT_DECRYPT',
        versionTemplate: {
          algorithm: 'GOOGLE_SYMMETRIC_ENCRYPTION',
          protectionLevel: 'SOFTWARE',
        },
      };

      if (rotationPeriodDays) {
        const rotationPeriodSeconds = rotationPeriodDays * 24 * 60 * 60;
        cryptoKey.rotationPeriod = { seconds: rotationPeriodSeconds };
        cryptoKey.nextRotationTime = {
          seconds: Math.floor(Date.now() / 1000) + rotationPeriodSeconds,
        };
      }

      await this.client.createCryptoKey({
        parent,
        cryptoKeyId: keyId,
        cryptoKey,
      });

      return true;
    } catch (error) {
      if ((error as Error).message?.includes('ALREADY_EXISTS')) {
        return true;
      }
      console.error('Failed to create crypto key:', error);
      return false;
    }
  }

  /**
   * Rotate the crypto key
   */
  async rotateKey(): Promise<{
    success: boolean;
    newVersion?: string;
    error?: string;
  }> {
    try {
      const [version] = await this.client.createCryptoKeyVersion({
        parent: this.getCryptoKeyName(),
        cryptoKeyVersion: {
          state: 'ENABLED',
        },
      });

      // Clear the key cache to force re-decryption with new version
      this.keyCache.clear();

      return {
        success: true,
        newVersion: version.name?.split('/').pop(),
      };
    } catch (error) {
      return {
        success: false,
        error: `Key rotation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * List all key versions
   */
  async listKeyVersions(): Promise<{
    success: boolean;
    versions?: Array<{
      version: string;
      state: string;
      createTime: string;
    }>;
    error?: string;
  }> {
    try {
      const [versions] = await this.client.listCryptoKeyVersions({
        parent: this.getCryptoKeyName(),
      });

      return {
        success: true,
        versions: versions.map(v => ({
          version: v.name?.split('/').pop() || '',
          state: v.state || 'UNKNOWN',
          createTime: v.createTime?.seconds
            ? new Date(Number(v.createTime.seconds) * 1000).toISOString()
            : '',
        })),
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to list key versions: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Disable a key version
   */
  async disableKeyVersion(version: string): Promise<boolean> {
    try {
      await this.client.updateCryptoKeyVersion({
        cryptoKeyVersion: {
          name: this.getCryptoKeyVersionName(version),
          state: 'DISABLED',
        },
        updateMask: {
          paths: ['state'],
        },
      });

      return true;
    } catch (error) {
      console.error('Failed to disable key version:', error);
      return false;
    }
  }

  /**
   * Destroy a key version (schedule for destruction)
   */
  async destroyKeyVersion(version: string): Promise<boolean> {
    try {
      await this.client.destroyCryptoKeyVersion({
        name: this.getCryptoKeyVersionName(version),
      });

      return true;
    } catch (error) {
      console.error('Failed to destroy key version:', error);
      return false;
    }
  }

  /**
   * Clear the key cache
   */
  clearCache(): void {
    this.keyCache.clear();
  }

  /**
   * Hash a key for caching
   */
  private hashKey(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  /**
   * Re-encrypt data with the latest key version
   */
  async reEncrypt(ciphertext: string): Promise<KMSEncryptResult> {
    // First decrypt with any version
    const decrypted = await this.decrypt(ciphertext);
    if (!decrypted.success || !decrypted.plaintext) {
      return {
        success: false,
        error: decrypted.error || 'Failed to decrypt for re-encryption',
      };
    }

    // Re-encrypt with the primary (latest) version
    return this.encrypt(decrypted.plaintext);
  }

  /**
   * Asymmetric encrypt using RSA key (if configured)
   */
  async asymmetricEncrypt(
    plaintext: string | Buffer,
    publicKeyName: string
  ): Promise<KMSEncryptResult> {
    try {
      // Get the public key
      const [publicKey] = await this.client.getPublicKey({
        name: publicKeyName,
      });

      if (!publicKey.pem) {
        return {
          success: false,
          error: 'Failed to retrieve public key',
        };
      }

      const plaintextBuffer = Buffer.isBuffer(plaintext)
        ? plaintext
        : Buffer.from(plaintext, 'utf8');

      // Encrypt locally using the public key
      const encrypted = crypto.publicEncrypt(
        {
          key: publicKey.pem,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256',
        },
        plaintextBuffer
      );

      return {
        success: true,
        ciphertext: encrypted.toString('base64'),
      };
    } catch (error) {
      return {
        success: false,
        error: `Asymmetric encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Asymmetric decrypt using RSA key
   */
  async asymmetricDecrypt(
    ciphertext: string,
    privateKeyName: string
  ): Promise<KMSDecryptResult> {
    try {
      const ciphertextBuffer = Buffer.from(ciphertext, 'base64');

      const [decryptResponse] = await this.client.asymmetricDecrypt({
        name: privateKeyName,
        ciphertext: ciphertextBuffer,
      });

      if (!decryptResponse.plaintext) {
        return {
          success: false,
          error: 'Asymmetric decryption returned no plaintext',
        };
      }

      return {
        success: true,
        plaintext: Buffer.isBuffer(decryptResponse.plaintext)
          ? decryptResponse.plaintext
          : Buffer.from(decryptResponse.plaintext),
      };
    } catch (error) {
      return {
        success: false,
        error: `Asymmetric decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Sign data using asymmetric key
   */
  async sign(
    data: string | Buffer,
    keyVersionName: string
  ): Promise<{
    success: boolean;
    signature?: string;
    error?: string;
  }> {
    try {
      const dataBuffer = Buffer.isBuffer(data)
        ? data
        : Buffer.from(data, 'utf8');

      // Create digest
      const digest = crypto.createHash('sha256').update(dataBuffer).digest();

      const [signResponse] = await this.client.asymmetricSign({
        name: keyVersionName,
        digest: {
          sha256: digest,
        },
      });

      if (!signResponse.signature) {
        return {
          success: false,
          error: 'Signing returned no signature',
        };
      }

      return {
        success: true,
        signature: Buffer.isBuffer(signResponse.signature)
          ? signResponse.signature.toString('base64')
          : Buffer.from(signResponse.signature).toString('base64'),
      };
    } catch (error) {
      return {
        success: false,
        error: `Signing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Verify signature using public key
   */
  async verify(
    data: string | Buffer,
    signature: string,
    publicKeyName: string
  ): Promise<{
    success: boolean;
    valid?: boolean;
    error?: string;
  }> {
    try {
      // Get the public key
      const [publicKey] = await this.client.getPublicKey({
        name: publicKeyName,
      });

      if (!publicKey.pem) {
        return {
          success: false,
          error: 'Failed to retrieve public key',
        };
      }

      const dataBuffer = Buffer.isBuffer(data)
        ? data
        : Buffer.from(data, 'utf8');

      const signatureBuffer = Buffer.from(signature, 'base64');

      const verifier = crypto.createVerify('SHA256');
      verifier.update(dataBuffer);

      const valid = verifier.verify(publicKey.pem, signatureBuffer);

      return {
        success: true,
        valid,
      };
    } catch (error) {
      return {
        success: false,
        error: `Verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
}

// Factory function
export function createKMSService(
  config: KMSConfig,
  cacheTimeoutMinutes?: number
): KMSService {
  return new KMSService(config, cacheTimeoutMinutes);
}

export default KMSService;
