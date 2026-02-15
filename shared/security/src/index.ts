/**
 * @fileops/security
 * Shared security module for the Cloud-Native File Operations Platform
 *
 * Provides:
 * - AES-256-GCM encryption at rest
 * - Google Cloud KMS integration
 * - TLS 1.3 configuration and certificate management
 * - Data anonymization for analytics
 * - Zero-trust security model
 * - Security event logging and alerting
 * - Intrusion detection and prevention
 * - Audit trail and compliance reporting
 */

// Export types
export * from './types';

// Export encryption services
export {
  EncryptionService,
  getEncryptionService,
} from './encryption';

// Export KMS services
export {
  KMSService,
  createKMSService,
} from './kms';

// Export TLS services
export {
  TLSService,
  createTLSService,
} from './tls';

// Export anonymization services
export {
  AnonymizationService,
  createAnonymizationService,
} from './anonymization';

// Export zero-trust services
export {
  ZeroTrustService,
  createZeroTrustService,
} from './zero-trust';

// Export security event services
export {
  SecurityEventService,
  createSecurityEventService,
} from './security-events';

// Export intrusion detection services
export {
  IntrusionDetectionService,
  createIntrusionDetectionService,
} from './intrusion-detection';

// Export audit services
export {
  AuditService,
  createAuditService,
} from './audit';

// Export vulnerability scanner services
export {
  VulnerabilityScannerService,
  createVulnerabilityScannerService,
} from './vulnerability-scanner';

// Re-export default instances for convenience
import { EncryptionService } from './encryption';
import { TLSService } from './tls';
import { AnonymizationService } from './anonymization';
import { ZeroTrustService } from './zero-trust';
import { SecurityEventService } from './security-events';
import { IntrusionDetectionService } from './intrusion-detection';
import { AuditService } from './audit';
import { VulnerabilityScannerService } from './vulnerability-scanner';

export const defaultEncryptionService = new EncryptionService();
export const defaultTLSService = new TLSService();
export const defaultAnonymizationService = new AnonymizationService();
export const defaultZeroTrustService = new ZeroTrustService();
export const defaultSecurityEventService = new SecurityEventService();
export const defaultIntrusionDetectionService = new IntrusionDetectionService();
export const defaultAuditService = new AuditService();
export const defaultVulnerabilityScannerService = new VulnerabilityScannerService();
