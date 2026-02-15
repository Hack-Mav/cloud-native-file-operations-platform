/**
 * Security module types and interfaces
 */

// Encryption types
export interface EncryptionConfig {
  algorithm: 'aes-256-gcm' | 'aes-256-cbc';
  keyDerivationIterations: number;
  saltLength: number;
  ivLength: number;
  tagLength: number;
  encoding: BufferEncoding;
}

export interface EncryptedData {
  ciphertext: string;
  iv: string;
  tag?: string;
  salt?: string;
  algorithm: string;
  keyId?: string;
  version: number;
}

export interface EncryptionResult {
  success: boolean;
  data?: EncryptedData;
  error?: string;
}

export interface DecryptionResult {
  success: boolean;
  plaintext?: string | Buffer;
  error?: string;
}

// KMS types
export interface KMSConfig {
  projectId: string;
  locationId: string;
  keyRingId: string;
  cryptoKeyId: string;
  cryptoKeyVersion?: string;
}

export interface KMSKeyMetadata {
  keyId: string;
  keyRingId: string;
  projectId: string;
  algorithm: string;
  purpose: string;
  state: string;
  createTime: string;
  rotationPeriod?: string;
  nextRotationTime?: string;
}

export interface KMSEncryptResult {
  success: boolean;
  ciphertext?: string;
  keyVersion?: string;
  error?: string;
}

export interface KMSDecryptResult {
  success: boolean;
  plaintext?: string | Buffer;
  error?: string;
}

// TLS types
export interface TLSConfig {
  minVersion: 'TLSv1.2' | 'TLSv1.3';
  maxVersion?: 'TLSv1.2' | 'TLSv1.3';
  ciphers?: string[];
  honorCipherOrder?: boolean;
  certPath?: string;
  keyPath?: string;
  caPath?: string;
  rejectUnauthorized?: boolean;
}

export interface CertificateInfo {
  subject: string;
  issuer: string;
  validFrom: Date;
  validTo: Date;
  serialNumber: string;
  fingerprint: string;
  daysUntilExpiry: number;
  isValid: boolean;
}

export interface CertificateValidationResult {
  valid: boolean;
  certificate?: CertificateInfo;
  errors?: string[];
}

// Anonymization types
export type AnonymizationTechnique =
  | 'hash'
  | 'mask'
  | 'redact'
  | 'generalize'
  | 'pseudonymize'
  | 'tokenize'
  | 'k-anonymity'
  | 'differential-privacy';

export interface AnonymizationRule {
  field: string;
  technique: AnonymizationTechnique;
  options?: Record<string, unknown>;
}

export interface AnonymizationConfig {
  rules: AnonymizationRule[];
  preserveFormat?: boolean;
  salt?: string;
  tokenPrefix?: string;
}

export interface AnonymizationResult {
  success: boolean;
  data?: Record<string, unknown>;
  mappings?: Record<string, string>;
  error?: string;
}

// Zero-Trust types
export interface ZeroTrustPolicy {
  id: string;
  name: string;
  enabled: boolean;
  conditions: ZeroTrustCondition[];
  actions: ZeroTrustAction[];
  priority: number;
}

export interface ZeroTrustCondition {
  type: 'ip' | 'location' | 'device' | 'time' | 'role' | 'resource' | 'behavior' | 'risk-score';
  operator: 'equals' | 'not-equals' | 'contains' | 'in' | 'not-in' | 'greater-than' | 'less-than';
  value: string | string[] | number;
}

export interface ZeroTrustAction {
  type: 'allow' | 'deny' | 'mfa-required' | 'step-up-auth' | 'log' | 'alert' | 'quarantine';
  parameters?: Record<string, unknown>;
}

export interface ZeroTrustContext {
  userId: string;
  ipAddress: string;
  userAgent: string;
  deviceId?: string;
  location?: GeoLocation;
  timestamp: Date;
  resource: string;
  action: string;
  riskScore?: number;
  sessionId?: string;
  tenantId?: string;
}

export interface GeoLocation {
  country?: string;
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
}

export interface ZeroTrustDecision {
  allowed: boolean;
  reason: string;
  requiredActions?: ZeroTrustAction[];
  matchedPolicies: string[];
  riskScore: number;
  timestamp: Date;
}

// Security event types
export interface SecurityEvent {
  id: string;
  type: SecurityEventType;
  severity: SecuritySeverity;
  timestamp: Date;
  source: string;
  userId?: string;
  ipAddress?: string;
  resource?: string;
  action?: string;
  outcome: 'success' | 'failure' | 'blocked';
  details: Record<string, unknown>;
  correlationId?: string;
  tenantId?: string;
}

export type SecurityEventType =
  | 'authentication'
  | 'authorization'
  | 'encryption'
  | 'decryption'
  | 'key-rotation'
  | 'access-denied'
  | 'suspicious-activity'
  | 'intrusion-attempt'
  | 'data-breach'
  | 'policy-violation'
  | 'certificate-expiry'
  | 'vulnerability-detected';

export type SecuritySeverity = 'low' | 'medium' | 'high' | 'critical';

// Compliance types
export type ComplianceFramework = 'GDPR' | 'HIPAA' | 'SOC2' | 'PCI-DSS' | 'ISO27001';

export interface ComplianceCheck {
  id: string;
  framework: ComplianceFramework;
  requirement: string;
  description: string;
  status: 'compliant' | 'non-compliant' | 'partial' | 'not-applicable';
  evidence?: string[];
  lastChecked: Date;
  remediation?: string;
}

export interface ComplianceReport {
  id: string;
  framework: ComplianceFramework;
  generatedAt: Date;
  period: {
    start: Date;
    end: Date;
  };
  overallStatus: 'compliant' | 'non-compliant' | 'partial';
  checks: ComplianceCheck[];
  summary: {
    total: number;
    compliant: number;
    nonCompliant: number;
    partial: number;
    notApplicable: number;
  };
}

// Intrusion detection types
export interface IntrusionSignature {
  id: string;
  name: string;
  description: string;
  pattern: RegExp | string;
  severity: SecuritySeverity;
  category: IntrusionCategory;
  enabled: boolean;
}

export type IntrusionCategory =
  | 'sql-injection'
  | 'xss'
  | 'path-traversal'
  | 'command-injection'
  | 'brute-force'
  | 'credential-stuffing'
  | 'api-abuse'
  | 'data-exfiltration'
  | 'privilege-escalation'
  | 'anomaly';

export interface IntrusionAlert {
  id: string;
  signature: IntrusionSignature;
  detectedAt: Date;
  source: {
    ip: string;
    port?: number;
    userId?: string;
  };
  target: {
    resource: string;
    method: string;
    path: string;
  };
  payload?: string;
  blocked: boolean;
  confidence: number;
}

// Data protection types
export interface DataClassification {
  level: 'public' | 'internal' | 'confidential' | 'restricted' | 'top-secret';
  categories: string[];
  retentionPeriod?: number;
  encryptionRequired: boolean;
  accessRestrictions?: string[];
}

export interface DataProtectionPolicy {
  id: string;
  name: string;
  classification: DataClassification;
  rules: DataProtectionRule[];
  enabled: boolean;
}

export interface DataProtectionRule {
  type: 'encryption' | 'masking' | 'retention' | 'access' | 'audit';
  action: string;
  parameters: Record<string, unknown>;
}
