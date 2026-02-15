/**
 * Intrusion Detection Service Tests
 * Tests for IDPS signatures, attack detection, and blocking
 */

import { IntrusionDetectionService } from '../src/intrusion-detection';
import { SecurityEvent } from '../src/types';

describe('IntrusionDetectionService', () => {
  let idps: IntrusionDetectionService;

  beforeEach(() => {
    idps = new IntrusionDetectionService();
  });

  describe('SQL Injection Detection', () => {
    it('should detect UNION-based SQL injection', async () => {
      const result = await idps.analyzeRequest({
        method: 'GET',
        path: '/api/users',
        headers: {},
        query: { id: "1 UNION SELECT * FROM users" },
        ip: '192.168.1.100',
        timestamp: new Date(),
      });

      expect(result.safe).toBe(false);
      expect(result.alerts.length).toBeGreaterThan(0);
      expect(result.alerts.some(a => a.signature.category === 'sql-injection')).toBe(true);
    });

    it('should detect SQL comment injection', async () => {
      const result = await idps.analyzeRequest({
        method: 'POST',
        path: '/api/login',
        headers: {},
        body: "username=admin'--&password=anything",
        ip: '192.168.1.100',
        timestamp: new Date(),
      });

      expect(result.safe).toBe(false);
      expect(result.alerts.some(a => a.signature.category === 'sql-injection')).toBe(true);
    });

    it('should detect boolean-based SQL injection', async () => {
      const result = await idps.analyzeRequest({
        method: 'GET',
        path: '/api/users',
        headers: {},
        query: { id: "1' OR '1'='1" },
        ip: '192.168.1.100',
        timestamp: new Date(),
      });

      expect(result.safe).toBe(false);
    });
  });

  describe('XSS Detection', () => {
    it('should detect script tag injection', async () => {
      const result = await idps.analyzeRequest({
        method: 'POST',
        path: '/api/comments',
        headers: {},
        body: '<script>alert("XSS")</script>',
        ip: '192.168.1.100',
        timestamp: new Date(),
      });

      expect(result.safe).toBe(false);
      expect(result.alerts.some(a => a.signature.category === 'xss')).toBe(true);
    });

    it('should detect event handler injection', async () => {
      const result = await idps.analyzeRequest({
        method: 'POST',
        path: '/api/profile',
        headers: {},
        body: '<img src="x" onerror="alert(1)">',
        ip: '192.168.1.100',
        timestamp: new Date(),
      });

      expect(result.safe).toBe(false);
      expect(result.alerts.some(a => a.signature.category === 'xss')).toBe(true);
    });

    it('should detect javascript protocol injection', async () => {
      const result = await idps.analyzeRequest({
        method: 'GET',
        path: '/api/redirect',
        headers: {},
        query: { url: 'javascript:alert(1)' },
        ip: '192.168.1.100',
        timestamp: new Date(),
      });

      expect(result.safe).toBe(false);
    });
  });

  describe('Path Traversal Detection', () => {
    it('should detect basic path traversal', async () => {
      const result = await idps.analyzeRequest({
        method: 'GET',
        path: '/api/files/../../../etc/passwd',
        headers: {},
        ip: '192.168.1.100',
        timestamp: new Date(),
      });

      expect(result.safe).toBe(false);
      expect(result.alerts.some(a => a.signature.category === 'path-traversal')).toBe(true);
    });

    it('should detect URL-encoded path traversal', async () => {
      const result = await idps.analyzeRequest({
        method: 'GET',
        path: '/api/files',
        headers: {},
        query: { file: '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc/passwd' },
        ip: '192.168.1.100',
        timestamp: new Date(),
      });

      expect(result.safe).toBe(false);
    });
  });

  describe('Command Injection Detection', () => {
    it('should detect command injection with semicolon', async () => {
      const result = await idps.analyzeRequest({
        method: 'POST',
        path: '/api/convert',
        headers: {},
        body: 'filename=test.pdf; rm -rf /',
        ip: '192.168.1.100',
        timestamp: new Date(),
      });

      expect(result.safe).toBe(false);
      expect(result.alerts.some(a => a.signature.category === 'command-injection')).toBe(true);
    });

    it('should detect command injection with pipe', async () => {
      const result = await idps.analyzeRequest({
        method: 'POST',
        path: '/api/ping',
        headers: {},
        body: 'host=127.0.0.1 | cat /etc/passwd',
        ip: '192.168.1.100',
        timestamp: new Date(),
      });

      expect(result.safe).toBe(false);
    });

    it('should detect command injection with backticks', async () => {
      const result = await idps.analyzeRequest({
        method: 'GET',
        path: '/api/info',
        headers: {},
        query: { param: '`whoami`' },
        ip: '192.168.1.100',
        timestamp: new Date(),
      });

      expect(result.safe).toBe(false);
    });
  });

  describe('Rate Limiting', () => {
    it('should block IP after exceeding rate limit', async () => {
      const ip = '192.168.1.200';

      // Make many requests
      for (let i = 0; i < 150; i++) {
        await idps.analyzeRequest({
          method: 'GET',
          path: '/api/data',
          headers: {},
          ip,
          timestamp: new Date(),
        });
      }

      // Should be rate limited now
      const result = await idps.analyzeRequest({
        method: 'GET',
        path: '/api/data',
        headers: {},
        ip,
        timestamp: new Date(),
      });

      expect(result.blocked).toBe(true);
      expect(result.reason).toContain('Rate limit');
    });
  });

  describe('IP Blocking', () => {
    it('should block requests from blocked IP', async () => {
      const ip = '10.0.0.100';
      idps.blockIP(ip, 'Suspicious activity', 60);

      const result = await idps.analyzeRequest({
        method: 'GET',
        path: '/api/data',
        headers: {},
        ip,
        timestamp: new Date(),
      });

      expect(result.blocked).toBe(true);
      expect(result.safe).toBe(false);
    });

    it('should unblock IP after calling unblockIP', async () => {
      const ip = '10.0.0.101';
      idps.blockIP(ip, 'Test', 60);
      idps.unblockIP(ip);

      const result = await idps.analyzeRequest({
        method: 'GET',
        path: '/api/safe',
        headers: {},
        ip,
        timestamp: new Date(),
      });

      expect(result.blocked).toBe(false);
    });

    it('should list blocked IPs', () => {
      idps.blockIP('10.0.0.1', 'Test 1', 60);
      idps.blockIP('10.0.0.2', 'Test 2', 60);

      const blockedIPs = idps.getBlockedIPs();

      expect(blockedIPs.length).toBe(2);
      expect(blockedIPs.some(b => b.ip === '10.0.0.1')).toBe(true);
      expect(blockedIPs.some(b => b.ip === '10.0.0.2')).toBe(true);
    });
  });

  describe('Signature Management', () => {
    it('should add custom signature', async () => {
      idps.addSignature({
        id: 'custom-test-1',
        name: 'Test Pattern Detection',
        description: 'Detects test attack pattern',
        pattern: /MALICIOUS_PATTERN/i,
        severity: 'high',
        category: 'other',
        enabled: true,
      });

      const result = await idps.analyzeRequest({
        method: 'POST',
        path: '/api/data',
        headers: {},
        body: 'Contains MALICIOUS_PATTERN here',
        ip: '192.168.1.100',
        timestamp: new Date(),
      });

      expect(result.safe).toBe(false);
      expect(result.alerts.some(a => a.signature.name === 'Test Pattern Detection')).toBe(true);
    });

    it('should remove signature', () => {
      const signatureId = 'sql-injection-1';
      idps.removeSignature(signatureId);

      const signatures = idps.getSignatures();
      expect(signatures.some(s => s.id === signatureId)).toBe(false);
    });

    it('should list all signatures', () => {
      const signatures = idps.getSignatures();

      expect(signatures.length).toBeGreaterThan(0);
      expect(signatures.some(s => s.category === 'sql-injection')).toBe(true);
      expect(signatures.some(s => s.category === 'xss')).toBe(true);
    });
  });

  describe('Alert Callbacks', () => {
    it('should notify callbacks on alert', async () => {
      const alerts: any[] = [];
      idps.onAlert(alert => {
        alerts.push(alert);
      });

      await idps.analyzeRequest({
        method: 'GET',
        path: '/api/users',
        headers: {},
        query: { id: "1 UNION SELECT * FROM users" },
        ip: '192.168.1.100',
        timestamp: new Date(),
      });

      expect(alerts.length).toBeGreaterThan(0);
    });
  });

  describe('Security Event Emission', () => {
    it('should emit security events', async () => {
      const events: SecurityEvent[] = [];
      idps.onSecurityEvent(event => {
        events.push(event);
      });

      idps.blockIP('10.0.0.50', 'Test blocking', 60);

      expect(events.length).toBeGreaterThan(0);
      expect(events.some(e => e.type === 'intrusion-attempt')).toBe(true);
    });
  });

  describe('Statistics', () => {
    it('should provide statistics', () => {
      idps.blockIP('10.0.0.1', 'Test', 60);
      idps.blockIP('10.0.0.2', 'Test', 60);

      const stats = idps.getStatistics();

      expect(stats.activeBlocks).toBeGreaterThanOrEqual(2);
      expect(stats.signaturesEnabled).toBeGreaterThan(0);
    });
  });

  describe('Safe Requests', () => {
    it('should allow safe requests', async () => {
      const result = await idps.analyzeRequest({
        method: 'GET',
        path: '/api/users/123',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'Mozilla/5.0 Chrome/120.0',
        },
        ip: '192.168.1.50',
        timestamp: new Date(),
      });

      expect(result.safe).toBe(true);
      expect(result.blocked).toBe(false);
      expect(result.alerts.length).toBe(0);
    });

    it('should allow normal POST requests', async () => {
      const result = await idps.analyzeRequest({
        method: 'POST',
        path: '/api/users',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'John Doe', email: 'john@example.com' }),
        ip: '192.168.1.50',
        timestamp: new Date(),
      });

      expect(result.safe).toBe(true);
      expect(result.blocked).toBe(false);
    });
  });

  describe('Sensitive Endpoint Scanning', () => {
    it('should detect scanning for admin endpoints', async () => {
      const result = await idps.analyzeRequest({
        method: 'GET',
        path: '/admin/config',
        headers: {},
        ip: '192.168.1.100',
        timestamp: new Date(),
      });

      expect(result.alerts.some(a => a.signature.category === 'api-abuse')).toBe(true);
    });

    it('should detect scanning for backup files', async () => {
      const result = await idps.analyzeRequest({
        method: 'GET',
        path: '/backup/database.sql',
        headers: {},
        ip: '192.168.1.100',
        timestamp: new Date(),
      });

      expect(result.alerts.some(a => a.signature.category === 'api-abuse')).toBe(true);
    });
  });
});
