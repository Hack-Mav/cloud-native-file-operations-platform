/**
 * TLS Configuration and Certificate Management Module
 * Provides TLS 1.3 configuration, certificate validation, and management
 */

import * as fs from 'fs';
import * as tls from 'tls';
import * as crypto from 'crypto';
import * as https from 'https';
import {
  TLSConfig,
  CertificateInfo,
  CertificateValidationResult,
  SecurityEvent,
} from './types';

// Modern TLS 1.3 cipher suites
const TLS13_CIPHERS = [
  'TLS_AES_256_GCM_SHA384',
  'TLS_CHACHA20_POLY1305_SHA256',
  'TLS_AES_128_GCM_SHA256',
];

// Strong TLS 1.2 cipher suites (fallback)
const TLS12_CIPHERS = [
  'ECDHE-ECDSA-AES256-GCM-SHA384',
  'ECDHE-RSA-AES256-GCM-SHA384',
  'ECDHE-ECDSA-CHACHA20-POLY1305',
  'ECDHE-RSA-CHACHA20-POLY1305',
  'ECDHE-ECDSA-AES128-GCM-SHA256',
  'ECDHE-RSA-AES128-GCM-SHA256',
];

const DEFAULT_CONFIG: TLSConfig = {
  minVersion: 'TLSv1.3',
  maxVersion: 'TLSv1.3',
  honorCipherOrder: true,
  rejectUnauthorized: true,
};

export class TLSService {
  private config: TLSConfig;
  private certCache: Map<string, { cert: CertificateInfo; expiresAt: Date }>;
  private eventCallback?: (event: SecurityEvent) => void;

  constructor(config: Partial<TLSConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.certCache = new Map();
  }

  /**
   * Set callback for security events
   */
  onSecurityEvent(callback: (event: SecurityEvent) => void): void {
    this.eventCallback = callback;
  }

  /**
   * Get TLS options for HTTPS server
   */
  getServerOptions(): tls.TlsOptions {
    const options: tls.TlsOptions = {
      minVersion: this.config.minVersion,
      maxVersion: this.config.maxVersion,
      ciphers: this.getCipherSuites(),
      honorCipherOrder: this.config.honorCipherOrder,
      // Modern security headers
      sessionTimeout: 300, // 5 minutes
      handshakeTimeout: 10000, // 10 seconds
    };

    if (this.config.certPath && this.config.keyPath) {
      options.cert = fs.readFileSync(this.config.certPath);
      options.key = fs.readFileSync(this.config.keyPath);
    }

    if (this.config.caPath) {
      options.ca = fs.readFileSync(this.config.caPath);
    }

    return options;
  }

  /**
   * Get TLS options for HTTPS client
   */
  getClientOptions(): https.RequestOptions {
    return {
      minVersion: this.config.minVersion,
      maxVersion: this.config.maxVersion,
      ciphers: this.getCipherSuites(),
      rejectUnauthorized: this.config.rejectUnauthorized,
    };
  }

  /**
   * Get secure context for TLS
   */
  createSecureContext(): tls.SecureContext {
    const options: tls.SecureContextOptions = {
      minVersion: this.config.minVersion,
      maxVersion: this.config.maxVersion,
      ciphers: this.getCipherSuites(),
      honorCipherOrder: this.config.honorCipherOrder,
    };

    if (this.config.certPath && this.config.keyPath) {
      options.cert = fs.readFileSync(this.config.certPath);
      options.key = fs.readFileSync(this.config.keyPath);
    }

    if (this.config.caPath) {
      options.ca = fs.readFileSync(this.config.caPath);
    }

    return tls.createSecureContext(options);
  }

  /**
   * Get appropriate cipher suites
   */
  getCipherSuites(): string {
    if (this.config.ciphers) {
      return this.config.ciphers.join(':');
    }

    const ciphers = this.config.minVersion === 'TLSv1.3'
      ? [...TLS13_CIPHERS, ...TLS12_CIPHERS]
      : TLS12_CIPHERS;

    return ciphers.join(':');
  }

  /**
   * Load certificate from file
   */
  loadCertificate(certPath: string): CertificateInfo | null {
    try {
      const certPem = fs.readFileSync(certPath, 'utf8');
      return this.parseCertificate(certPem);
    } catch (error) {
      console.error('Failed to load certificate:', error);
      return null;
    }
  }

  /**
   * Parse certificate PEM
   */
  parseCertificate(certPem: string): CertificateInfo | null {
    try {
      const cert = new crypto.X509Certificate(certPem);
      const now = new Date();
      const validFrom = new Date(cert.validFrom);
      const validTo = new Date(cert.validTo);
      const daysUntilExpiry = Math.floor(
        (validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      return {
        subject: cert.subject,
        issuer: cert.issuer,
        validFrom,
        validTo,
        serialNumber: cert.serialNumber,
        fingerprint: cert.fingerprint256,
        daysUntilExpiry,
        isValid: now >= validFrom && now <= validTo,
      };
    } catch (error) {
      console.error('Failed to parse certificate:', error);
      return null;
    }
  }

  /**
   * Validate certificate
   */
  validateCertificate(
    certPem: string,
    hostname?: string
  ): CertificateValidationResult {
    const errors: string[] = [];
    const cert = this.parseCertificate(certPem);

    if (!cert) {
      return {
        valid: false,
        errors: ['Failed to parse certificate'],
      };
    }

    // Check expiry
    const now = new Date();
    if (now < cert.validFrom) {
      errors.push('Certificate is not yet valid');
    }

    if (now > cert.validTo) {
      errors.push('Certificate has expired');
    }

    // Warn if expiring soon (30 days)
    if (cert.daysUntilExpiry <= 30 && cert.daysUntilExpiry > 0) {
      this.emitSecurityEvent({
        id: crypto.randomUUID(),
        type: 'certificate-expiry',
        severity: cert.daysUntilExpiry <= 7 ? 'high' : 'medium',
        timestamp: new Date(),
        source: 'tls-service',
        outcome: 'success',
        details: {
          daysUntilExpiry: cert.daysUntilExpiry,
          subject: cert.subject,
          validTo: cert.validTo.toISOString(),
        },
      });
    }

    // Check hostname if provided
    if (hostname) {
      const subjectCN = this.extractCN(cert.subject);
      if (subjectCN && !this.matchHostname(hostname, subjectCN)) {
        errors.push(`Hostname ${hostname} does not match certificate subject ${subjectCN}`);
      }
    }

    return {
      valid: errors.length === 0,
      certificate: cert,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Validate certificate chain
   */
  async validateCertificateChain(
    certPem: string,
    chainPem: string
  ): Promise<CertificateValidationResult> {
    const errors: string[] = [];

    try {
      const cert = new crypto.X509Certificate(certPem);
      const chain = new crypto.X509Certificate(chainPem);

      // Verify the certificate was signed by the chain
      const verified = cert.verify(chain.publicKey);
      if (!verified) {
        errors.push('Certificate chain validation failed');
      }

      const certInfo = this.parseCertificate(certPem);

      return {
        valid: errors.length === 0 && verified,
        certificate: certInfo || undefined,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      return {
        valid: false,
        errors: [`Chain validation error: ${error instanceof Error ? error.message : 'Unknown error'}`],
      };
    }
  }

  /**
   * Check certificate expiry for a remote host
   */
  async checkRemoteCertificate(
    hostname: string,
    port: number = 443
  ): Promise<CertificateValidationResult> {
    return new Promise((resolve) => {
      const cacheKey = `${hostname}:${port}`;
      const cached = this.certCache.get(cacheKey);

      if (cached && cached.expiresAt > new Date()) {
        resolve({
          valid: cached.cert.isValid,
          certificate: cached.cert,
        });
        return;
      }

      const socket = tls.connect(
        {
          host: hostname,
          port,
          servername: hostname,
          rejectUnauthorized: false,
        },
        () => {
          const cert = socket.getPeerCertificate(true);
          socket.end();

          if (!cert || Object.keys(cert).length === 0) {
            resolve({
              valid: false,
              errors: ['No certificate returned'],
            });
            return;
          }

          const certInfo: CertificateInfo = {
            subject: cert.subject ? Object.values(cert.subject).join(', ') : '',
            issuer: cert.issuer ? Object.values(cert.issuer).join(', ') : '',
            validFrom: new Date(cert.valid_from),
            validTo: new Date(cert.valid_to),
            serialNumber: cert.serialNumber || '',
            fingerprint: cert.fingerprint256 || cert.fingerprint || '',
            daysUntilExpiry: Math.floor(
              (new Date(cert.valid_to).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
            ),
            isValid: socket.authorized,
          };

          // Cache for 1 hour
          this.certCache.set(cacheKey, {
            cert: certInfo,
            expiresAt: new Date(Date.now() + 3600000),
          });

          resolve({
            valid: certInfo.isValid,
            certificate: certInfo,
          });
        }
      );

      socket.on('error', (error) => {
        resolve({
          valid: false,
          errors: [`Connection error: ${error.message}`],
        });
      });

      socket.setTimeout(10000, () => {
        socket.destroy();
        resolve({
          valid: false,
          errors: ['Connection timeout'],
        });
      });
    });
  }

  /**
   * Generate a self-signed certificate for development
   */
  generateSelfSignedCertificate(
    commonName: string,
    validityDays: number = 365
  ): { cert: string; key: string } {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 4096,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    });

    // Note: For production, use a proper CA or ACME protocol
    // This is a simplified version for development/testing
    const notBefore = new Date();
    const notAfter = new Date();
    notAfter.setDate(notAfter.getDate() + validityDays);

    // In a real implementation, you would use a library like node-forge
    // to generate proper X.509 certificates
    console.warn(
      'Self-signed certificate generation is simplified. ' +
      'For production, use proper certificate authority.'
    );

    return {
      cert: publicKey, // Placeholder - would be actual certificate
      key: privateKey,
    };
  }

  /**
   * Monitor certificate expiry
   */
  startExpiryMonitoring(
    certificates: Array<{ name: string; path: string }>,
    checkIntervalHours: number = 24
  ): NodeJS.Timeout {
    const checkCertificates = () => {
      for (const cert of certificates) {
        const certInfo = this.loadCertificate(cert.path);
        if (certInfo) {
          if (certInfo.daysUntilExpiry <= 0) {
            this.emitSecurityEvent({
              id: crypto.randomUUID(),
              type: 'certificate-expiry',
              severity: 'critical',
              timestamp: new Date(),
              source: 'tls-service',
              outcome: 'failure',
              details: {
                certificateName: cert.name,
                path: cert.path,
                expiredAt: certInfo.validTo.toISOString(),
              },
            });
          } else if (certInfo.daysUntilExpiry <= 30) {
            this.emitSecurityEvent({
              id: crypto.randomUUID(),
              type: 'certificate-expiry',
              severity: certInfo.daysUntilExpiry <= 7 ? 'high' : 'medium',
              timestamp: new Date(),
              source: 'tls-service',
              outcome: 'success',
              details: {
                certificateName: cert.name,
                path: cert.path,
                daysUntilExpiry: certInfo.daysUntilExpiry,
                expiresAt: certInfo.validTo.toISOString(),
              },
            });
          }
        }
      }
    };

    // Check immediately
    checkCertificates();

    // Then check periodically
    return setInterval(checkCertificates, checkIntervalHours * 60 * 60 * 1000);
  }

  /**
   * Get security headers for responses
   */
  getSecurityHeaders(): Record<string, string> {
    return {
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Content-Security-Policy': "default-src 'self'",
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    };
  }

  /**
   * Create HTTPS agent with secure configuration
   */
  createSecureAgent(): https.Agent {
    return new https.Agent({
      minVersion: this.config.minVersion,
      maxVersion: this.config.maxVersion,
      ciphers: this.getCipherSuites(),
      rejectUnauthorized: this.config.rejectUnauthorized,
      keepAlive: true,
      keepAliveMsecs: 1000,
      maxSockets: 100,
    });
  }

  /**
   * Extract Common Name from subject string
   */
  private extractCN(subject: string): string | null {
    const match = subject.match(/CN=([^,]+)/);
    return match ? match[1] : null;
  }

  /**
   * Match hostname against certificate CN (including wildcards)
   */
  private matchHostname(hostname: string, pattern: string): boolean {
    if (pattern.startsWith('*.')) {
      const wildcardDomain = pattern.substring(2);
      const hostParts = hostname.split('.');
      const patternParts = wildcardDomain.split('.');

      if (hostParts.length !== patternParts.length + 1) {
        return false;
      }

      return hostParts.slice(1).join('.') === wildcardDomain;
    }

    return hostname === pattern;
  }

  /**
   * Emit security event
   */
  private emitSecurityEvent(event: SecurityEvent): void {
    if (this.eventCallback) {
      this.eventCallback(event);
    }
  }

  /**
   * Clear certificate cache
   */
  clearCache(): void {
    this.certCache.clear();
  }
}

// Factory function
export function createTLSService(config?: Partial<TLSConfig>): TLSService {
  return new TLSService(config);
}

export default TLSService;
