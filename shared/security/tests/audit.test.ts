/**
 * Audit Service Tests
 * Tests for audit trail, compliance reporting, and data retention
 */

import { AuditService } from '../src/audit';
import { ComplianceFramework } from '../src/types';

describe('AuditService', () => {
  let auditService: AuditService;

  beforeEach(() => {
    auditService = new AuditService('test-service', '1.0.0', 1000);
  });

  afterEach(() => {
    auditService.clear();
  });

  describe('Basic Logging', () => {
    it('should log an audit entry', () => {
      const entry = auditService.log({
        timestamp: new Date(),
        eventType: 'test-event',
        actor: { userId: 'user-123' },
        action: 'create',
        resource: { type: 'file', id: 'file-456' },
        outcome: 'success',
        details: { size: 1024 },
      });

      expect(entry.id).toBeDefined();
      expect(entry.hash).toBeDefined();
      expect(entry.metadata.serviceName).toBe('test-service');
    });

    it('should create hash chain for entries', () => {
      const entry1 = auditService.log({
        timestamp: new Date(),
        eventType: 'event-1',
        actor: { userId: 'user-1' },
        action: 'action-1',
        resource: { type: 'resource', id: '1' },
        outcome: 'success',
        details: {},
      });

      const entry2 = auditService.log({
        timestamp: new Date(),
        eventType: 'event-2',
        actor: { userId: 'user-2' },
        action: 'action-2',
        resource: { type: 'resource', id: '2' },
        outcome: 'success',
        details: {},
      });

      expect(entry2.previousHash).toBe(entry1.hash);
    });
  });

  describe('User Action Logging', () => {
    it('should log user actions', () => {
      const entry = auditService.logUserAction(
        'user-123',
        'upload',
        'file',
        'file-456',
        'success',
        { fileSize: 1024, mimeType: 'application/pdf' },
        { ipAddress: '192.168.1.100', userAgent: 'Chrome' }
      );

      expect(entry.eventType).toBe('user-action');
      expect(entry.actor.userId).toBe('user-123');
      expect(entry.actor.ipAddress).toBe('192.168.1.100');
      expect(entry.action).toBe('upload');
      expect(entry.resource.type).toBe('file');
    });
  });

  describe('System Event Logging', () => {
    it('should log system events', () => {
      const entry = auditService.logSystemEvent(
        'backup',
        'database',
        'db-001',
        'success',
        { duration: 3600, recordsBackedUp: 10000 }
      );

      expect(entry.eventType).toBe('system-event');
      expect(entry.actor.userId).toBeUndefined();
      expect(entry.action).toBe('backup');
    });
  });

  describe('Data Access Logging', () => {
    it('should log data access', () => {
      const entry = auditService.logDataAccess(
        'user-123',
        'read',
        'customer-record',
        'cust-789',
        { fields: ['name', 'email'] },
        { ipAddress: '10.0.0.1', dataClassification: 'confidential' }
      );

      expect(entry.eventType).toBe('data-access');
      expect(entry.action).toBe('read');
      expect(entry.details.dataClassification).toBe('confidential');
    });
  });

  describe('Configuration Change Logging', () => {
    it('should log configuration changes', () => {
      const entry = auditService.logConfigChange(
        'admin-001',
        'security-policy',
        'mfa-settings',
        { enabled: false },
        { enabled: true, enforceForAdmins: true },
        { reason: 'Security enhancement' }
      );

      expect(entry.eventType).toBe('config-change');
      expect(entry.details.oldValue).toBeDefined();
      expect(entry.details.newValue).toBeDefined();
    });

    it('should redact sensitive values in config changes', () => {
      const entry = auditService.logConfigChange(
        'admin-001',
        'api-credentials',
        'external-api',
        { apiKey: 'secret-old-key' },
        { apiKey: 'secret-new-key' }
      );

      expect(entry.details.oldValue).not.toContain('secret-old-key');
      expect(entry.details.newValue).not.toContain('secret-new-key');
    });
  });

  describe('Search', () => {
    beforeEach(() => {
      // Create test data
      for (let i = 0; i < 10; i++) {
        auditService.logUserAction(
          `user-${i % 3}`,
          i % 2 === 0 ? 'read' : 'write',
          'file',
          `file-${i}`,
          i % 4 === 0 ? 'failure' : 'success',
          { index: i }
        );
      }
    });

    it('should search by user ID', () => {
      const results = auditService.search({ userId: 'user-0' });

      expect(results.entries.length).toBeGreaterThan(0);
      expect(results.entries.every(e => e.actor.userId === 'user-0')).toBe(true);
    });

    it('should search by event type', () => {
      const results = auditService.search({ eventType: 'user-action' });

      expect(results.entries.length).toBe(10);
    });

    it('should search by action', () => {
      const results = auditService.search({ action: 'read' });

      expect(results.entries.length).toBeGreaterThan(0);
      expect(results.entries.every(e => e.action === 'read')).toBe(true);
    });

    it('should search by outcome', () => {
      const results = auditService.search({ outcome: 'failure' });

      expect(results.entries.length).toBeGreaterThan(0);
      expect(results.entries.every(e => e.outcome === 'failure')).toBe(true);
    });

    it('should search by time range', () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 3600000);

      const results = auditService.search({
        startTime: oneHourAgo,
        endTime: now,
      });

      expect(results.entries.length).toBe(10);
    });

    it('should paginate results', () => {
      const page1 = auditService.search({ limit: 5, offset: 0 });
      const page2 = auditService.search({ limit: 5, offset: 5 });

      expect(page1.entries.length).toBe(5);
      expect(page2.entries.length).toBe(5);
      expect(page1.entries[0].id).not.toBe(page2.entries[0].id);
      expect(page1.hasMore).toBe(true);
    });
  });

  describe('Integrity Verification', () => {
    it('should verify intact audit log', () => {
      auditService.logUserAction('user-1', 'action', 'resource', 'id-1', 'success', {});
      auditService.logUserAction('user-2', 'action', 'resource', 'id-2', 'success', {});
      auditService.logUserAction('user-3', 'action', 'resource', 'id-3', 'success', {});

      const result = auditService.verifyIntegrity();

      expect(result.valid).toBe(true);
      expect(result.invalidEntries.length).toBe(0);
    });
  });

  describe('Compliance Reporting', () => {
    it('should generate GDPR compliance report', () => {
      const startDate = new Date(Date.now() - 86400000);
      const endDate = new Date();

      const report = auditService.generateComplianceReport('GDPR', startDate, endDate);

      expect(report.framework).toBe('GDPR');
      expect(report.checks.length).toBeGreaterThan(0);
      expect(report.summary).toBeDefined();
      expect(['compliant', 'non-compliant', 'partial']).toContain(report.overallStatus);
    });

    it('should generate HIPAA compliance report', () => {
      const report = auditService.generateComplianceReport(
        'HIPAA',
        new Date(Date.now() - 86400000),
        new Date()
      );

      expect(report.framework).toBe('HIPAA');
      expect(report.checks.some(c => c.requirement === 'access-logging')).toBe(true);
    });

    it('should generate SOC 2 compliance report', () => {
      const report = auditService.generateComplianceReport(
        'SOC2',
        new Date(Date.now() - 86400000),
        new Date()
      );

      expect(report.framework).toBe('SOC2');
    });

    it('should add custom compliance check', () => {
      auditService.addComplianceCheck({
        id: 'custom-check-1',
        framework: 'GDPR',
        requirement: 'custom-requirement',
        description: 'Custom compliance check',
        status: 'compliant',
        lastChecked: new Date(),
      });

      const checks = auditService.getComplianceChecks('GDPR');
      expect(checks.some(c => c.id === 'custom-check-1')).toBe(true);
    });
  });

  describe('Data Retention', () => {
    it('should add retention policy', () => {
      auditService.addRetentionPolicy({
        id: 'test-policy',
        name: 'Test Retention',
        dataType: 'test-event',
        retentionDays: 30,
        deleteAfterDays: 90,
        enabled: true,
      });

      const policies = auditService.getRetentionPolicies();
      expect(policies.some(p => p.id === 'test-policy')).toBe(true);
    });

    it('should apply retention policies', () => {
      const result = auditService.applyRetentionPolicies();

      expect(result).toHaveProperty('archived');
      expect(result).toHaveProperty('deleted');
    });
  });

  describe('Export', () => {
    beforeEach(() => {
      auditService.logUserAction('user-1', 'action', 'resource', 'id-1', 'success', {});
      auditService.logUserAction('user-2', 'action', 'resource', 'id-2', 'success', {});
    });

    it('should export to JSON', () => {
      const exported = auditService.exportAuditLog(
        new Date(Date.now() - 86400000),
        new Date(),
        'json'
      );

      const parsed = JSON.parse(exported);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(2);
    });

    it('should export to CSV', () => {
      const exported = auditService.exportAuditLog(
        new Date(Date.now() - 86400000),
        new Date(),
        'csv'
      );

      const lines = exported.split('\n');
      expect(lines[0]).toContain('id');
      expect(lines[0]).toContain('timestamp');
      expect(lines.length).toBe(3); // Header + 2 data rows
    });
  });

  describe('Statistics', () => {
    beforeEach(() => {
      auditService.logUserAction('user-1', 'read', 'file', 'id-1', 'success', {});
      auditService.logUserAction('user-1', 'write', 'file', 'id-2', 'success', {});
      auditService.logUserAction('user-2', 'delete', 'file', 'id-3', 'failure', {});
      auditService.logSystemEvent('backup', 'database', 'db-1', 'success', {});
    });

    it('should provide statistics', () => {
      const stats = auditService.getStatistics(24);

      expect(stats.totalEntries).toBe(4);
      expect(stats.entriesByType['user-action']).toBe(3);
      expect(stats.entriesByType['system-event']).toBe(1);
      expect(stats.entriesByOutcome['success']).toBe(3);
      expect(stats.entriesByOutcome['failure']).toBe(1);
    });

    it('should provide top users', () => {
      const stats = auditService.getStatistics(24);

      expect(stats.topUsers.length).toBeGreaterThan(0);
      expect(stats.topUsers[0].userId).toBe('user-1');
      expect(stats.topUsers[0].count).toBe(2);
    });

    it('should provide top resources', () => {
      const stats = auditService.getStatistics(24);

      expect(stats.topResources.length).toBeGreaterThan(0);
      expect(stats.topResources.some(r => r.resourceType === 'file')).toBe(true);
    });
  });

  describe('Recent Entries', () => {
    it('should return recent entries', () => {
      auditService.logUserAction('user-1', 'action', 'resource', 'id-1', 'success', {});
      auditService.logUserAction('user-2', 'action', 'resource', 'id-2', 'success', {});
      auditService.logUserAction('user-3', 'action', 'resource', 'id-3', 'success', {});

      const recent = auditService.getRecentEntries(2);

      expect(recent.length).toBe(2);
    });
  });
});
