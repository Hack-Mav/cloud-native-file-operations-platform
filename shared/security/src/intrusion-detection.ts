/**
 * Intrusion Detection and Prevention System (IDPS)
 * Provides real-time threat detection and automated response
 */

import * as crypto from 'crypto';
import {
  IntrusionSignature,
  IntrusionCategory,
  IntrusionAlert,
  SecurityEvent,
  SecuritySeverity,
} from './types';

interface RequestContext {
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: string;
  query?: Record<string, string>;
  ip: string;
  userId?: string;
  timestamp: Date;
}

interface BlockedIP {
  ip: string;
  reason: string;
  blockedAt: Date;
  expiresAt: Date;
  violations: number;
}

interface AnomalyProfile {
  userId: string;
  normalRequestRate: number;
  normalEndpoints: Set<string>;
  normalUserAgents: Set<string>;
  normalPayloadSizes: { min: number; max: number; avg: number };
  lastUpdated: Date;
}

interface ThreatIntelligence {
  knownBadIPs: Set<string>;
  knownBadUserAgents: string[];
  knownBadPatterns: RegExp[];
  lastUpdated: Date;
}

type AlertCallback = (alert: IntrusionAlert) => void | Promise<void>;

export class IntrusionDetectionService {
  private signatures: Map<string, IntrusionSignature>;
  private blockedIPs: Map<string, BlockedIP>;
  private anomalyProfiles: Map<string, AnomalyProfile>;
  private requestHistory: Map<string, Array<{ timestamp: Date; endpoint: string }>>;
  private threatIntel: ThreatIntelligence;
  private alertCallbacks: AlertCallback[];
  private eventCallback?: (event: SecurityEvent) => void;

  // Configuration
  private readonly BLOCK_DURATION_MINUTES = 60;
  private readonly MAX_VIOLATIONS_BEFORE_PERMANENT = 10;
  private readonly RATE_LIMIT_WINDOW_MS = 60000;
  private readonly RATE_LIMIT_MAX_REQUESTS = 100;

  constructor() {
    this.signatures = new Map();
    this.blockedIPs = new Map();
    this.anomalyProfiles = new Map();
    this.requestHistory = new Map();
    this.alertCallbacks = [];
    this.threatIntel = {
      knownBadIPs: new Set(),
      knownBadUserAgents: [],
      knownBadPatterns: [],
      lastUpdated: new Date(),
    };

    this.loadDefaultSignatures();
  }

  /**
   * Set callback for security events
   */
  onSecurityEvent(callback: (event: SecurityEvent) => void): void {
    this.eventCallback = callback;
  }

  /**
   * Register alert callback
   */
  onAlert(callback: AlertCallback): void {
    this.alertCallbacks.push(callback);
  }

  /**
   * Analyze request for intrusion attempts
   */
  async analyzeRequest(context: RequestContext): Promise<{
    safe: boolean;
    blocked: boolean;
    alerts: IntrusionAlert[];
    reason?: string;
  }> {
    const alerts: IntrusionAlert[] = [];

    // Check if IP is blocked
    const blockStatus = this.checkBlocked(context.ip);
    if (blockStatus.blocked) {
      return {
        safe: false,
        blocked: true,
        alerts: [],
        reason: blockStatus.reason,
      };
    }

    // Check threat intelligence
    if (this.threatIntel.knownBadIPs.has(context.ip)) {
      this.blockIP(context.ip, 'IP in threat intelligence blocklist', this.BLOCK_DURATION_MINUTES * 2);
      return {
        safe: false,
        blocked: true,
        alerts: [],
        reason: 'IP in threat blocklist',
      };
    }

    // Check rate limiting
    const rateLimitResult = this.checkRateLimit(context.ip);
    if (!rateLimitResult.allowed) {
      const alert = this.createAlert('rate-limit', 'high', context, 'Rate limit exceeded');
      alerts.push(alert);
      this.blockIP(context.ip, 'Rate limit exceeded', 15);
      return {
        safe: false,
        blocked: true,
        alerts,
        reason: 'Rate limit exceeded',
      };
    }

    // Run signature-based detection
    for (const signature of this.signatures.values()) {
      if (!signature.enabled) continue;

      const match = this.matchSignature(signature, context);
      if (match) {
        const alert = this.createAlert(signature.category, signature.severity, context, signature.name, match);
        alerts.push(alert);
        await this.notifyAlert(alert);
      }
    }

    // Run anomaly detection
    const anomalyAlerts = this.detectAnomalies(context);
    alerts.push(...anomalyAlerts);

    // Determine if request should be blocked
    const hasHighSeverityAlert = alerts.some(
      a => a.signature.severity === 'high' || a.signature.severity === 'critical'
    );

    if (hasHighSeverityAlert) {
      this.incrementViolations(context.ip, alerts[0]?.signature.name || 'Unknown');
    }

    // Record request for future analysis
    this.recordRequest(context);

    return {
      safe: alerts.length === 0,
      blocked: hasHighSeverityAlert,
      alerts,
      reason: hasHighSeverityAlert ? alerts[0]?.signature.description : undefined,
    };
  }

  /**
   * Match request against signature
   */
  private matchSignature(signature: IntrusionSignature, context: RequestContext): string | null {
    const pattern = typeof signature.pattern === 'string'
      ? new RegExp(signature.pattern, 'i')
      : signature.pattern;

    // Check URL path
    if (pattern.test(context.path)) {
      return `Path: ${context.path}`;
    }

    // Check query parameters
    if (context.query) {
      for (const [key, value] of Object.entries(context.query)) {
        if (pattern.test(value)) {
          return `Query param ${key}: ${value}`;
        }
      }
    }

    // Check body
    if (context.body && pattern.test(context.body)) {
      return `Body content matched`;
    }

    // Check headers
    for (const [key, value] of Object.entries(context.headers)) {
      if (pattern.test(value)) {
        return `Header ${key}: ${value}`;
      }
    }

    return null;
  }

  /**
   * Create intrusion alert
   */
  private createAlert(
    category: IntrusionCategory,
    severity: SecuritySeverity,
    context: RequestContext,
    name: string,
    payload?: string
  ): IntrusionAlert {
    const signature: IntrusionSignature = {
      id: crypto.randomUUID(),
      name,
      description: `Detected ${name} attempt`,
      pattern: '',
      severity,
      category,
      enabled: true,
    };

    return {
      id: crypto.randomUUID(),
      signature,
      detectedAt: new Date(),
      source: {
        ip: context.ip,
        userId: context.userId,
      },
      target: {
        resource: context.path,
        method: context.method,
        path: context.path,
      },
      payload,
      blocked: severity === 'high' || severity === 'critical',
      confidence: this.calculateConfidence(category, payload),
    };
  }

  /**
   * Calculate detection confidence
   */
  private calculateConfidence(category: IntrusionCategory, payload?: string): number {
    let confidence = 0.7;

    // Higher confidence for known attack patterns
    if (payload) {
      if (payload.includes('SELECT') || payload.includes('UNION')) {
        confidence = 0.95;
      } else if (payload.includes('<script') || payload.includes('javascript:')) {
        confidence = 0.9;
      } else if (payload.includes('..') || payload.includes('%2e%2e')) {
        confidence = 0.85;
      }
    }

    return confidence;
  }

  /**
   * Detect anomalies in request
   */
  private detectAnomalies(context: RequestContext): IntrusionAlert[] {
    const alerts: IntrusionAlert[] = [];
    const profile = this.anomalyProfiles.get(context.userId || context.ip);

    if (!profile) return alerts;

    // Check unusual endpoint access
    if (!profile.normalEndpoints.has(context.path)) {
      // Only flag if user has established pattern
      if (profile.normalEndpoints.size > 10) {
        alerts.push(this.createAlert(
          'anomaly',
          'low',
          context,
          'Unusual endpoint access',
          `User accessing unusual endpoint: ${context.path}`
        ));
      }
    }

    // Check unusual user agent
    const userAgent = context.headers['user-agent'] || '';
    if (userAgent && !profile.normalUserAgents.has(userAgent)) {
      if (profile.normalUserAgents.size > 3) {
        alerts.push(this.createAlert(
          'anomaly',
          'low',
          context,
          'New user agent detected',
          `User agent: ${userAgent}`
        ));
      }
    }

    // Check unusual payload size
    if (context.body) {
      const size = context.body.length;
      if (size > profile.normalPayloadSizes.max * 2) {
        alerts.push(this.createAlert(
          'anomaly',
          'medium',
          context,
          'Unusually large payload',
          `Payload size: ${size} bytes (normal max: ${profile.normalPayloadSizes.max})`
        ));
      }
    }

    return alerts;
  }

  /**
   * Check rate limiting
   */
  private checkRateLimit(ip: string): { allowed: boolean; count: number } {
    const history = this.requestHistory.get(ip) || [];
    const windowStart = new Date(Date.now() - this.RATE_LIMIT_WINDOW_MS);
    const recentRequests = history.filter(r => r.timestamp >= windowStart);

    return {
      allowed: recentRequests.length < this.RATE_LIMIT_MAX_REQUESTS,
      count: recentRequests.length,
    };
  }

  /**
   * Record request for analysis
   */
  private recordRequest(context: RequestContext): void {
    const key = context.userId || context.ip;
    const history = this.requestHistory.get(key) || [];

    history.push({
      timestamp: context.timestamp,
      endpoint: context.path,
    });

    // Keep only last hour of history
    const cutoff = new Date(Date.now() - 3600000);
    const filtered = history.filter(r => r.timestamp >= cutoff);
    this.requestHistory.set(key, filtered);

    // Update anomaly profile
    this.updateAnomalyProfile(context);
  }

  /**
   * Update anomaly profile
   */
  private updateAnomalyProfile(context: RequestContext): void {
    const key = context.userId || context.ip;
    const profile = this.anomalyProfiles.get(key) || {
      userId: key,
      normalRequestRate: 0,
      normalEndpoints: new Set<string>(),
      normalUserAgents: new Set<string>(),
      normalPayloadSizes: { min: Infinity, max: 0, avg: 0 },
      lastUpdated: new Date(),
    };

    profile.normalEndpoints.add(context.path);

    const userAgent = context.headers['user-agent'];
    if (userAgent) {
      profile.normalUserAgents.add(userAgent);
    }

    if (context.body) {
      const size = context.body.length;
      profile.normalPayloadSizes.min = Math.min(profile.normalPayloadSizes.min, size);
      profile.normalPayloadSizes.max = Math.max(profile.normalPayloadSizes.max, size);
      profile.normalPayloadSizes.avg = (profile.normalPayloadSizes.avg + size) / 2;
    }

    profile.lastUpdated = new Date();
    this.anomalyProfiles.set(key, profile);
  }

  /**
   * Check if IP is blocked
   */
  private checkBlocked(ip: string): { blocked: boolean; reason: string } {
    const blocked = this.blockedIPs.get(ip);

    if (!blocked) {
      return { blocked: false, reason: '' };
    }

    if (blocked.expiresAt <= new Date()) {
      this.blockedIPs.delete(ip);
      return { blocked: false, reason: '' };
    }

    return { blocked: true, reason: blocked.reason };
  }

  /**
   * Block an IP address
   */
  blockIP(ip: string, reason: string, durationMinutes: number): void {
    const existing = this.blockedIPs.get(ip);
    const violations = (existing?.violations || 0) + 1;

    // Permanent block after too many violations
    const duration = violations >= this.MAX_VIOLATIONS_BEFORE_PERMANENT
      ? 365 * 24 * 60
      : durationMinutes;

    this.blockedIPs.set(ip, {
      ip,
      reason,
      blockedAt: new Date(),
      expiresAt: new Date(Date.now() + duration * 60 * 1000),
      violations,
    });

    this.emitSecurityEvent({
      id: crypto.randomUUID(),
      type: 'intrusion-attempt',
      severity: 'high',
      timestamp: new Date(),
      source: 'idps',
      ipAddress: ip,
      outcome: 'blocked',
      details: { reason, duration: durationMinutes, violations },
    });
  }

  /**
   * Unblock an IP address
   */
  unblockIP(ip: string): void {
    this.blockedIPs.delete(ip);
  }

  /**
   * Get blocked IPs
   */
  getBlockedIPs(): BlockedIP[] {
    return Array.from(this.blockedIPs.values()).filter(
      b => b.expiresAt > new Date()
    );
  }

  /**
   * Increment violations for IP
   */
  private incrementViolations(ip: string, reason: string): void {
    const existing = this.blockedIPs.get(ip);

    if (existing) {
      existing.violations++;
      if (existing.violations >= 3) {
        this.blockIP(ip, reason, this.BLOCK_DURATION_MINUTES);
      }
    } else {
      // Track violation even if not blocked yet
      this.blockedIPs.set(ip, {
        ip,
        reason,
        blockedAt: new Date(),
        expiresAt: new Date(0), // Not blocked, just tracking
        violations: 1,
      });
    }
  }

  /**
   * Notify alert to callbacks
   */
  private async notifyAlert(alert: IntrusionAlert): Promise<void> {
    for (const callback of this.alertCallbacks) {
      try {
        await callback(alert);
      } catch (error) {
        console.error('Alert callback error:', error);
      }
    }

    this.emitSecurityEvent({
      id: crypto.randomUUID(),
      type: 'intrusion-attempt',
      severity: alert.signature.severity,
      timestamp: alert.detectedAt,
      source: 'idps',
      ipAddress: alert.source.ip,
      userId: alert.source.userId,
      resource: alert.target.resource,
      action: alert.target.method,
      outcome: alert.blocked ? 'blocked' : 'success',
      details: {
        category: alert.signature.category,
        name: alert.signature.name,
        payload: alert.payload,
        confidence: alert.confidence,
      },
    });
  }

  /**
   * Add signature
   */
  addSignature(signature: IntrusionSignature): void {
    this.signatures.set(signature.id, signature);
  }

  /**
   * Remove signature
   */
  removeSignature(id: string): void {
    this.signatures.delete(id);
  }

  /**
   * Get all signatures
   */
  getSignatures(): IntrusionSignature[] {
    return Array.from(this.signatures.values());
  }

  /**
   * Update threat intelligence
   */
  updateThreatIntelligence(intel: Partial<ThreatIntelligence>): void {
    if (intel.knownBadIPs) {
      for (const ip of intel.knownBadIPs) {
        this.threatIntel.knownBadIPs.add(ip);
      }
    }

    if (intel.knownBadUserAgents) {
      this.threatIntel.knownBadUserAgents.push(...intel.knownBadUserAgents);
    }

    if (intel.knownBadPatterns) {
      this.threatIntel.knownBadPatterns.push(...intel.knownBadPatterns);
    }

    this.threatIntel.lastUpdated = new Date();
  }

  /**
   * Load default signatures
   */
  private loadDefaultSignatures(): void {
    // SQL Injection signatures
    this.addSignature({
      id: 'sql-injection-1',
      name: 'SQL Injection - UNION',
      description: 'Detects UNION-based SQL injection attempts',
      pattern: /UNION\s+(ALL\s+)?SELECT/i,
      severity: 'high',
      category: 'sql-injection',
      enabled: true,
    });

    this.addSignature({
      id: 'sql-injection-2',
      name: 'SQL Injection - Comment',
      description: 'Detects SQL comment-based injection',
      pattern: /('|")\s*(--|#|\/\*)/i,
      severity: 'high',
      category: 'sql-injection',
      enabled: true,
    });

    this.addSignature({
      id: 'sql-injection-3',
      name: 'SQL Injection - Boolean',
      description: 'Detects boolean-based SQL injection',
      pattern: /'\s*(OR|AND)\s*['"]?\d+['"]?\s*=\s*['"]?\d+/i,
      severity: 'high',
      category: 'sql-injection',
      enabled: true,
    });

    // XSS signatures
    this.addSignature({
      id: 'xss-1',
      name: 'XSS - Script Tag',
      description: 'Detects script tag injection',
      pattern: /<script[^>]*>|<\/script>/i,
      severity: 'high',
      category: 'xss',
      enabled: true,
    });

    this.addSignature({
      id: 'xss-2',
      name: 'XSS - Event Handler',
      description: 'Detects inline event handler injection',
      pattern: /\bon(load|error|click|mouse|focus|blur|key|submit)\s*=/i,
      severity: 'high',
      category: 'xss',
      enabled: true,
    });

    this.addSignature({
      id: 'xss-3',
      name: 'XSS - Javascript Protocol',
      description: 'Detects javascript: protocol injection',
      pattern: /javascript\s*:/i,
      severity: 'high',
      category: 'xss',
      enabled: true,
    });

    // Path Traversal signatures
    this.addSignature({
      id: 'path-traversal-1',
      name: 'Path Traversal - Basic',
      description: 'Detects basic path traversal attempts',
      pattern: /\.\.\//,
      severity: 'high',
      category: 'path-traversal',
      enabled: true,
    });

    this.addSignature({
      id: 'path-traversal-2',
      name: 'Path Traversal - Encoded',
      description: 'Detects URL-encoded path traversal',
      pattern: /%2e%2e(\/|%2f)/i,
      severity: 'high',
      category: 'path-traversal',
      enabled: true,
    });

    // Command Injection signatures
    this.addSignature({
      id: 'command-injection-1',
      name: 'Command Injection - Basic',
      description: 'Detects command injection via shell operators',
      pattern: /[;&|`]|\$\(/,
      severity: 'critical',
      category: 'command-injection',
      enabled: true,
    });

    // Brute Force detection
    this.addSignature({
      id: 'brute-force-1',
      name: 'Brute Force - Auth Endpoint',
      description: 'Detects rapid auth attempts (handled by rate limiter)',
      pattern: /\/auth\/(login|token|authenticate)/i,
      severity: 'medium',
      category: 'brute-force',
      enabled: true,
    });

    // API Abuse
    this.addSignature({
      id: 'api-abuse-1',
      name: 'API Abuse - Sensitive Endpoint Scan',
      description: 'Detects scanning for sensitive endpoints',
      pattern: /\/(admin|config|backup|\.env|wp-admin|phpMyAdmin)/i,
      severity: 'medium',
      category: 'api-abuse',
      enabled: true,
    });
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
   * Get statistics
   */
  getStatistics(): {
    totalBlocked: number;
    activeBlocks: number;
    signaturesEnabled: number;
    recentAlerts: number;
  } {
    const activeBlocks = Array.from(this.blockedIPs.values()).filter(
      b => b.expiresAt > new Date()
    ).length;

    const enabledSignatures = Array.from(this.signatures.values()).filter(
      s => s.enabled
    ).length;

    return {
      totalBlocked: this.blockedIPs.size,
      activeBlocks,
      signaturesEnabled: enabledSignatures,
      recentAlerts: 0, // Would be tracked separately
    };
  }
}

// Factory function
export function createIntrusionDetectionService(): IntrusionDetectionService {
  return new IntrusionDetectionService();
}

export default IntrusionDetectionService;
