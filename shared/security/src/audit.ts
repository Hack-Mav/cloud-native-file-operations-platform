/**
 * Security Audit Trail and Compliance Reporting Module
 * Provides immutable audit logging and compliance framework support
 */

import * as crypto from 'crypto';
import {
  SecurityEvent,
  ComplianceFramework,
  ComplianceCheck,
  ComplianceReport,
} from './types';

interface AuditEntry {
  id: string;
  timestamp: Date;
  eventType: string;
  actor: {
    userId?: string;
    ipAddress?: string;
    userAgent?: string;
    sessionId?: string;
  };
  action: string;
  resource: {
    type: string;
    id: string;
    name?: string;
  };
  outcome: 'success' | 'failure' | 'partial';
  details: Record<string, unknown>;
  metadata: {
    correlationId?: string;
    tenantId?: string;
    serviceName: string;
    serviceVersion?: string;
  };
  previousHash?: string;
  hash: string;
}

interface AuditSearchCriteria {
  startTime?: Date;
  endTime?: Date;
  userId?: string;
  eventType?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  outcome?: 'success' | 'failure' | 'partial';
  tenantId?: string;
  limit?: number;
  offset?: number;
}

interface DataRetentionPolicy {
  id: string;
  name: string;
  dataType: string;
  retentionDays: number;
  archiveAfterDays?: number;
  deleteAfterDays: number;
  enabled: boolean;
}

export class AuditService {
  private auditLog: AuditEntry[];
  private complianceChecks: Map<string, ComplianceCheck>;
  private retentionPolicies: Map<string, DataRetentionPolicy>;
  private lastHash: string;
  private maxEntries: number;
  private serviceName: string;
  private serviceVersion: string;

  constructor(
    serviceName: string = 'file-ops-platform',
    serviceVersion: string = '1.0.0',
    maxEntries: number = 100000
  ) {
    this.auditLog = [];
    this.complianceChecks = new Map();
    this.retentionPolicies = new Map();
    this.lastHash = '';
    this.maxEntries = maxEntries;
    this.serviceName = serviceName;
    this.serviceVersion = serviceVersion;

    this.loadDefaultComplianceChecks();
    this.loadDefaultRetentionPolicies();
  }

  /**
   * Log an audit entry
   */
  log(entry: Omit<AuditEntry, 'id' | 'hash' | 'previousHash' | 'metadata'>): AuditEntry {
    const fullEntry: AuditEntry = {
      ...entry,
      id: crypto.randomUUID(),
      metadata: {
        serviceName: this.serviceName,
        serviceVersion: this.serviceVersion,
        correlationId: entry.details.correlationId as string,
        tenantId: entry.details.tenantId as string,
      },
      previousHash: this.lastHash,
      hash: '', // Will be calculated
    };

    // Calculate hash for integrity
    fullEntry.hash = this.calculateHash(fullEntry);
    this.lastHash = fullEntry.hash;

    this.auditLog.push(fullEntry);

    // Trim if over limit
    if (this.auditLog.length > this.maxEntries) {
      this.auditLog = this.auditLog.slice(-this.maxEntries);
    }

    return fullEntry;
  }

  /**
   * Log user action
   */
  logUserAction(
    userId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    outcome: 'success' | 'failure' | 'partial',
    details: Record<string, unknown>,
    options?: {
      ipAddress?: string;
      userAgent?: string;
      sessionId?: string;
      resourceName?: string;
    }
  ): AuditEntry {
    return this.log({
      timestamp: new Date(),
      eventType: 'user-action',
      actor: {
        userId,
        ipAddress: options?.ipAddress,
        userAgent: options?.userAgent,
        sessionId: options?.sessionId,
      },
      action,
      resource: {
        type: resourceType,
        id: resourceId,
        name: options?.resourceName,
      },
      outcome,
      details,
    });
  }

  /**
   * Log system event
   */
  logSystemEvent(
    action: string,
    resourceType: string,
    resourceId: string,
    outcome: 'success' | 'failure' | 'partial',
    details: Record<string, unknown>
  ): AuditEntry {
    return this.log({
      timestamp: new Date(),
      eventType: 'system-event',
      actor: {},
      action,
      resource: {
        type: resourceType,
        id: resourceId,
      },
      outcome,
      details,
    });
  }

  /**
   * Log data access
   */
  logDataAccess(
    userId: string,
    accessType: 'read' | 'write' | 'delete' | 'export',
    dataType: string,
    dataId: string,
    details: Record<string, unknown>,
    options?: {
      ipAddress?: string;
      dataClassification?: string;
    }
  ): AuditEntry {
    return this.log({
      timestamp: new Date(),
      eventType: 'data-access',
      actor: {
        userId,
        ipAddress: options?.ipAddress,
      },
      action: accessType,
      resource: {
        type: dataType,
        id: dataId,
      },
      outcome: 'success',
      details: {
        ...details,
        dataClassification: options?.dataClassification,
      },
    });
  }

  /**
   * Log security event
   */
  logSecurityEvent(securityEvent: SecurityEvent): AuditEntry {
    return this.log({
      timestamp: securityEvent.timestamp,
      eventType: 'security-event',
      actor: {
        userId: securityEvent.userId,
        ipAddress: securityEvent.ipAddress,
      },
      action: securityEvent.type,
      resource: {
        type: 'security',
        id: securityEvent.id,
      },
      outcome: securityEvent.outcome,
      details: {
        severity: securityEvent.severity,
        source: securityEvent.source,
        ...securityEvent.details,
      },
    });
  }

  /**
   * Log configuration change
   */
  logConfigChange(
    userId: string,
    configType: string,
    configId: string,
    oldValue: unknown,
    newValue: unknown,
    details?: Record<string, unknown>
  ): AuditEntry {
    return this.log({
      timestamp: new Date(),
      eventType: 'config-change',
      actor: { userId },
      action: 'update',
      resource: {
        type: configType,
        id: configId,
      },
      outcome: 'success',
      details: {
        oldValue: this.sanitizeValue(oldValue),
        newValue: this.sanitizeValue(newValue),
        ...details,
      },
    });
  }

  /**
   * Search audit log
   */
  search(criteria: AuditSearchCriteria): {
    entries: AuditEntry[];
    total: number;
    hasMore: boolean;
  } {
    let results = this.auditLog;

    if (criteria.startTime) {
      results = results.filter(e => e.timestamp >= criteria.startTime!);
    }

    if (criteria.endTime) {
      results = results.filter(e => e.timestamp <= criteria.endTime!);
    }

    if (criteria.userId) {
      results = results.filter(e => e.actor.userId === criteria.userId);
    }

    if (criteria.eventType) {
      results = results.filter(e => e.eventType === criteria.eventType);
    }

    if (criteria.action) {
      results = results.filter(e => e.action === criteria.action);
    }

    if (criteria.resourceType) {
      results = results.filter(e => e.resource.type === criteria.resourceType);
    }

    if (criteria.resourceId) {
      results = results.filter(e => e.resource.id === criteria.resourceId);
    }

    if (criteria.outcome) {
      results = results.filter(e => e.outcome === criteria.outcome);
    }

    if (criteria.tenantId) {
      results = results.filter(e => e.metadata.tenantId === criteria.tenantId);
    }

    const total = results.length;
    const offset = criteria.offset || 0;
    const limit = criteria.limit || 100;

    results = results.slice(offset, offset + limit);

    return {
      entries: results,
      total,
      hasMore: total > offset + limit,
    };
  }

  /**
   * Verify audit log integrity
   */
  verifyIntegrity(): {
    valid: boolean;
    invalidEntries: string[];
    lastValidEntry?: string;
  } {
    const invalidEntries: string[] = [];
    let lastValidEntry: string | undefined;
    let expectedPrevHash = '';

    for (const entry of this.auditLog) {
      // Verify chain
      if (entry.previousHash !== expectedPrevHash) {
        invalidEntries.push(entry.id);
        continue;
      }

      // Verify hash
      const calculatedHash = this.calculateHash(entry);
      if (calculatedHash !== entry.hash) {
        invalidEntries.push(entry.id);
        continue;
      }

      expectedPrevHash = entry.hash;
      lastValidEntry = entry.id;
    }

    return {
      valid: invalidEntries.length === 0,
      invalidEntries,
      lastValidEntry,
    };
  }

  /**
   * Calculate hash for audit entry
   */
  private calculateHash(entry: AuditEntry): string {
    const data = JSON.stringify({
      id: entry.id,
      timestamp: entry.timestamp.toISOString(),
      eventType: entry.eventType,
      actor: entry.actor,
      action: entry.action,
      resource: entry.resource,
      outcome: entry.outcome,
      details: entry.details,
      metadata: entry.metadata,
      previousHash: entry.previousHash,
    });

    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Sanitize sensitive values
   */
  private sanitizeValue(value: unknown): unknown {
    if (typeof value === 'string') {
      // Mask potential secrets
      if (value.length > 8 && /password|secret|key|token/i.test(String(value))) {
        return '***REDACTED***';
      }
    }

    if (typeof value === 'object' && value !== null) {
      const sanitized: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        if (/password|secret|key|token/i.test(k)) {
          sanitized[k] = '***REDACTED***';
        } else {
          sanitized[k] = this.sanitizeValue(v);
        }
      }
      return sanitized;
    }

    return value;
  }

  /**
   * Generate compliance report
   */
  generateComplianceReport(
    framework: ComplianceFramework,
    startDate: Date,
    endDate: Date
  ): ComplianceReport {
    const checks = Array.from(this.complianceChecks.values())
      .filter(c => c.framework === framework);

    const evaluatedChecks: ComplianceCheck[] = checks.map(check => ({
      ...check,
      status: this.evaluateComplianceCheck(check, startDate, endDate),
      lastChecked: new Date(),
    }));

    const summary = {
      total: evaluatedChecks.length,
      compliant: evaluatedChecks.filter(c => c.status === 'compliant').length,
      nonCompliant: evaluatedChecks.filter(c => c.status === 'non-compliant').length,
      partial: evaluatedChecks.filter(c => c.status === 'partial').length,
      notApplicable: evaluatedChecks.filter(c => c.status === 'not-applicable').length,
    };

    const overallStatus = summary.nonCompliant > 0
      ? 'non-compliant'
      : summary.partial > 0
        ? 'partial'
        : 'compliant';

    return {
      id: crypto.randomUUID(),
      framework,
      generatedAt: new Date(),
      period: { start: startDate, end: endDate },
      overallStatus,
      checks: evaluatedChecks,
      summary,
    };
  }

  /**
   * Evaluate compliance check
   */
  private evaluateComplianceCheck(
    check: ComplianceCheck,
    startDate: Date,
    endDate: Date
  ): ComplianceCheck['status'] {
    // In production, this would perform actual compliance checks
    // For now, return placeholder based on check type

    const relevantEntries = this.search({
      startTime: startDate,
      endTime: endDate,
      limit: 1000,
    });

    // Example evaluation logic
    switch (check.requirement) {
      case 'encryption-at-rest':
        // Check if encryption is enabled
        return 'compliant';

      case 'access-logging':
        // Check if all accesses are logged
        return relevantEntries.entries.length > 0 ? 'compliant' : 'non-compliant';

      case 'mfa-enforcement':
        // Check MFA status
        return 'partial';

      case 'data-retention':
        // Check retention policies
        return this.retentionPolicies.size > 0 ? 'compliant' : 'non-compliant';

      default:
        return 'not-applicable';
    }
  }

  /**
   * Add compliance check
   */
  addComplianceCheck(check: ComplianceCheck): void {
    this.complianceChecks.set(check.id, check);
  }

  /**
   * Get compliance checks for framework
   */
  getComplianceChecks(framework?: ComplianceFramework): ComplianceCheck[] {
    const checks = Array.from(this.complianceChecks.values());
    return framework ? checks.filter(c => c.framework === framework) : checks;
  }

  /**
   * Add retention policy
   */
  addRetentionPolicy(policy: DataRetentionPolicy): void {
    this.retentionPolicies.set(policy.id, policy);
  }

  /**
   * Get retention policies
   */
  getRetentionPolicies(): DataRetentionPolicy[] {
    return Array.from(this.retentionPolicies.values());
  }

  /**
   * Apply retention policies
   */
  applyRetentionPolicies(): {
    archived: number;
    deleted: number;
  } {
    let archived = 0;
    let deleted = 0;
    const now = new Date();

    for (const policy of this.retentionPolicies.values()) {
      if (!policy.enabled) continue;

      const deleteCutoff = new Date(now.getTime() - policy.deleteAfterDays * 24 * 60 * 60 * 1000);

      // In production, would actually archive/delete entries
      const toDelete = this.auditLog.filter(
        e => e.eventType === policy.dataType && e.timestamp < deleteCutoff
      );

      deleted += toDelete.length;
    }

    return { archived, deleted };
  }

  /**
   * Export audit log
   */
  exportAuditLog(
    startDate: Date,
    endDate: Date,
    format: 'json' | 'csv' = 'json'
  ): string {
    const entries = this.search({
      startTime: startDate,
      endTime: endDate,
      limit: this.maxEntries,
    }).entries;

    if (format === 'json') {
      return JSON.stringify(entries, null, 2);
    }

    // CSV format
    const headers = [
      'id',
      'timestamp',
      'eventType',
      'userId',
      'ipAddress',
      'action',
      'resourceType',
      'resourceId',
      'outcome',
    ];

    const rows = entries.map(e => [
      e.id,
      e.timestamp.toISOString(),
      e.eventType,
      e.actor.userId || '',
      e.actor.ipAddress || '',
      e.action,
      e.resource.type,
      e.resource.id,
      e.outcome,
    ]);

    return [
      headers.join(','),
      ...rows.map(r => r.map(v => `"${v}"`).join(',')),
    ].join('\n');
  }

  /**
   * Get audit statistics
   */
  getStatistics(windowHours: number = 24): {
    totalEntries: number;
    entriesByType: Record<string, number>;
    entriesByOutcome: Record<string, number>;
    topUsers: Array<{ userId: string; count: number }>;
    topResources: Array<{ resourceType: string; count: number }>;
  } {
    const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000);
    const recentEntries = this.auditLog.filter(e => e.timestamp >= windowStart);

    const entriesByType: Record<string, number> = {};
    const entriesByOutcome: Record<string, number> = {};
    const userCounts: Record<string, number> = {};
    const resourceCounts: Record<string, number> = {};

    for (const entry of recentEntries) {
      entriesByType[entry.eventType] = (entriesByType[entry.eventType] || 0) + 1;
      entriesByOutcome[entry.outcome] = (entriesByOutcome[entry.outcome] || 0) + 1;

      if (entry.actor.userId) {
        userCounts[entry.actor.userId] = (userCounts[entry.actor.userId] || 0) + 1;
      }

      resourceCounts[entry.resource.type] = (resourceCounts[entry.resource.type] || 0) + 1;
    }

    const sortByCount = (obj: Record<string, number>) =>
      Object.entries(obj)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    return {
      totalEntries: recentEntries.length,
      entriesByType,
      entriesByOutcome,
      topUsers: sortByCount(userCounts).map(([userId, count]) => ({ userId, count })),
      topResources: sortByCount(resourceCounts).map(([resourceType, count]) => ({
        resourceType,
        count,
      })),
    };
  }

  /**
   * Load default compliance checks
   */
  private loadDefaultComplianceChecks(): void {
    // GDPR checks
    this.addComplianceCheck({
      id: 'gdpr-data-access-logging',
      framework: 'GDPR',
      requirement: 'access-logging',
      description: 'All personal data access must be logged',
      status: 'compliant',
      lastChecked: new Date(),
    });

    this.addComplianceCheck({
      id: 'gdpr-encryption',
      framework: 'GDPR',
      requirement: 'encryption-at-rest',
      description: 'Personal data must be encrypted at rest',
      status: 'compliant',
      lastChecked: new Date(),
    });

    this.addComplianceCheck({
      id: 'gdpr-retention',
      framework: 'GDPR',
      requirement: 'data-retention',
      description: 'Data retention policies must be enforced',
      status: 'compliant',
      lastChecked: new Date(),
    });

    // HIPAA checks
    this.addComplianceCheck({
      id: 'hipaa-audit-trail',
      framework: 'HIPAA',
      requirement: 'access-logging',
      description: 'PHI access must be audited',
      status: 'compliant',
      lastChecked: new Date(),
    });

    this.addComplianceCheck({
      id: 'hipaa-encryption',
      framework: 'HIPAA',
      requirement: 'encryption-at-rest',
      description: 'PHI must be encrypted',
      status: 'compliant',
      lastChecked: new Date(),
    });

    this.addComplianceCheck({
      id: 'hipaa-mfa',
      framework: 'HIPAA',
      requirement: 'mfa-enforcement',
      description: 'MFA required for PHI access',
      status: 'partial',
      lastChecked: new Date(),
    });

    // SOC 2 checks
    this.addComplianceCheck({
      id: 'soc2-access-control',
      framework: 'SOC2',
      requirement: 'access-logging',
      description: 'Access control monitoring',
      status: 'compliant',
      lastChecked: new Date(),
    });

    this.addComplianceCheck({
      id: 'soc2-encryption',
      framework: 'SOC2',
      requirement: 'encryption-at-rest',
      description: 'Data encryption at rest',
      status: 'compliant',
      lastChecked: new Date(),
    });
  }

  /**
   * Load default retention policies
   */
  private loadDefaultRetentionPolicies(): void {
    this.addRetentionPolicy({
      id: 'security-events',
      name: 'Security Event Retention',
      dataType: 'security-event',
      retentionDays: 365,
      archiveAfterDays: 90,
      deleteAfterDays: 730,
      enabled: true,
    });

    this.addRetentionPolicy({
      id: 'user-actions',
      name: 'User Action Retention',
      dataType: 'user-action',
      retentionDays: 180,
      archiveAfterDays: 60,
      deleteAfterDays: 365,
      enabled: true,
    });

    this.addRetentionPolicy({
      id: 'data-access',
      name: 'Data Access Retention',
      dataType: 'data-access',
      retentionDays: 365,
      archiveAfterDays: 90,
      deleteAfterDays: 730,
      enabled: true,
    });
  }

  /**
   * Get recent entries
   */
  getRecentEntries(limit: number = 100): AuditEntry[] {
    return this.auditLog.slice(-limit);
  }

  /**
   * Clear audit log (for testing only)
   */
  clear(): void {
    this.auditLog = [];
    this.lastHash = '';
  }
}

// Factory function
export function createAuditService(
  serviceName?: string,
  serviceVersion?: string,
  maxEntries?: number
): AuditService {
  return new AuditService(serviceName, serviceVersion, maxEntries);
}

export default AuditService;
