/**
 * Zero-Trust Security Model Implementation
 * Implements "never trust, always verify" principles with
 * continuous authentication and authorization
 */

import * as crypto from 'crypto';
import {
  ZeroTrustPolicy,
  ZeroTrustCondition,
  ZeroTrustAction,
  ZeroTrustContext,
  ZeroTrustDecision,
  GeoLocation,
  SecurityEvent,
} from './types';

interface SessionRiskProfile {
  sessionId: string;
  userId: string;
  riskScore: number;
  factors: RiskFactor[];
  lastUpdated: Date;
  anomalies: string[];
}

interface RiskFactor {
  type: string;
  score: number;
  weight: number;
  details?: Record<string, unknown>;
}

interface BehaviorBaseline {
  userId: string;
  typicalLocations: string[];
  typicalHours: { start: number; end: number }[];
  typicalDevices: string[];
  averageRequestRate: number;
  lastUpdated: Date;
}

export class ZeroTrustService {
  private policies: Map<string, ZeroTrustPolicy>;
  private sessionRisks: Map<string, SessionRiskProfile>;
  private userBaselines: Map<string, BehaviorBaseline>;
  private accessHistory: Map<string, Array<{ timestamp: Date; resource: string; action: string }>>;
  private blockedEntities: Map<string, { type: 'ip' | 'user' | 'device'; expiresAt: Date; reason: string }>;
  private eventCallback?: (event: SecurityEvent) => void;

  // Risk score thresholds
  private readonly RISK_THRESHOLD_LOW = 30;
  private readonly RISK_THRESHOLD_MEDIUM = 60;
  private readonly RISK_THRESHOLD_HIGH = 80;

  constructor() {
    this.policies = new Map();
    this.sessionRisks = new Map();
    this.userBaselines = new Map();
    this.accessHistory = new Map();
    this.blockedEntities = new Map();

    // Load default policies
    this.loadDefaultPolicies();
  }

  /**
   * Set callback for security events
   */
  onSecurityEvent(callback: (event: SecurityEvent) => void): void {
    this.eventCallback = callback;
  }

  /**
   * Add a policy
   */
  addPolicy(policy: ZeroTrustPolicy): void {
    this.policies.set(policy.id, policy);
  }

  /**
   * Remove a policy
   */
  removePolicy(policyId: string): void {
    this.policies.delete(policyId);
  }

  /**
   * Get all policies
   */
  getPolicies(): ZeroTrustPolicy[] {
    return Array.from(this.policies.values());
  }

  /**
   * Evaluate access request
   */
  async evaluateAccess(context: ZeroTrustContext): Promise<ZeroTrustDecision> {
    const matchedPolicies: string[] = [];
    const requiredActions: ZeroTrustAction[] = [];
    let finalDecision = true;
    let reason = 'Access granted - all policies satisfied';

    // Check if entity is blocked
    const blockCheck = this.checkBlocked(context);
    if (blockCheck.blocked) {
      return {
        allowed: false,
        reason: blockCheck.reason,
        matchedPolicies: [],
        riskScore: 100,
        timestamp: new Date(),
      };
    }

    // Calculate risk score
    const riskScore = await this.calculateRiskScore(context);

    // Update context with risk score
    const enrichedContext: ZeroTrustContext = {
      ...context,
      riskScore,
    };

    // Evaluate all enabled policies sorted by priority
    const sortedPolicies = Array.from(this.policies.values())
      .filter(p => p.enabled)
      .sort((a, b) => a.priority - b.priority);

    for (const policy of sortedPolicies) {
      const policyResult = this.evaluatePolicy(policy, enrichedContext);

      if (policyResult.matched) {
        matchedPolicies.push(policy.id);

        for (const action of policyResult.actions) {
          if (action.type === 'deny') {
            finalDecision = false;
            reason = `Denied by policy: ${policy.name}`;
          } else if (action.type === 'mfa-required' || action.type === 'step-up-auth') {
            requiredActions.push(action);
          } else if (action.type === 'quarantine') {
            this.quarantineEntity(context.userId, 'user', 'Policy triggered quarantine');
            finalDecision = false;
            reason = 'Account quarantined for security review';
          }
        }
      }
    }

    // Apply risk-based decisions
    if (riskScore >= this.RISK_THRESHOLD_HIGH && finalDecision) {
      requiredActions.push({
        type: 'step-up-auth',
        parameters: { reason: 'High risk score detected' },
      });
    } else if (riskScore >= this.RISK_THRESHOLD_MEDIUM && finalDecision) {
      requiredActions.push({
        type: 'mfa-required',
        parameters: { reason: 'Elevated risk score' },
      });
    }

    // Record access attempt
    this.recordAccessAttempt(context, finalDecision);

    // Emit security event
    this.emitSecurityEvent({
      id: crypto.randomUUID(),
      type: finalDecision ? 'authorization' : 'access-denied',
      severity: finalDecision ? 'low' : 'medium',
      timestamp: new Date(),
      source: 'zero-trust',
      userId: context.userId,
      ipAddress: context.ipAddress,
      resource: context.resource,
      action: context.action,
      outcome: finalDecision ? 'success' : 'blocked',
      details: {
        riskScore,
        matchedPolicies,
        requiredActions: requiredActions.map(a => a.type),
      },
      tenantId: context.tenantId,
    });

    return {
      allowed: finalDecision,
      reason,
      requiredActions: requiredActions.length > 0 ? requiredActions : undefined,
      matchedPolicies,
      riskScore,
      timestamp: new Date(),
    };
  }

  /**
   * Evaluate a single policy
   */
  private evaluatePolicy(
    policy: ZeroTrustPolicy,
    context: ZeroTrustContext
  ): { matched: boolean; actions: ZeroTrustAction[] } {
    let allConditionsMet = true;

    for (const condition of policy.conditions) {
      if (!this.evaluateCondition(condition, context)) {
        allConditionsMet = false;
        break;
      }
    }

    return {
      matched: allConditionsMet,
      actions: allConditionsMet ? policy.actions : [],
    };
  }

  /**
   * Evaluate a single condition
   */
  private evaluateCondition(condition: ZeroTrustCondition, context: ZeroTrustContext): boolean {
    const contextValue = this.getContextValue(condition.type, context);

    switch (condition.operator) {
      case 'equals':
        return contextValue === condition.value;

      case 'not-equals':
        return contextValue !== condition.value;

      case 'contains':
        return String(contextValue).includes(String(condition.value));

      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(contextValue);

      case 'not-in':
        return Array.isArray(condition.value) && !condition.value.includes(contextValue);

      case 'greater-than':
        return Number(contextValue) > Number(condition.value);

      case 'less-than':
        return Number(contextValue) < Number(condition.value);

      default:
        return false;
    }
  }

  /**
   * Get value from context based on condition type
   */
  private getContextValue(type: ZeroTrustCondition['type'], context: ZeroTrustContext): unknown {
    switch (type) {
      case 'ip':
        return context.ipAddress;
      case 'location':
        return context.location?.country;
      case 'device':
        return context.deviceId;
      case 'time':
        return context.timestamp.getHours();
      case 'role':
        return context.userId; // Would be resolved from user service
      case 'resource':
        return context.resource;
      case 'behavior':
        return this.getBehaviorScore(context.userId);
      case 'risk-score':
        return context.riskScore;
      default:
        return null;
    }
  }

  /**
   * Calculate risk score for context
   */
  async calculateRiskScore(context: ZeroTrustContext): Promise<number> {
    const factors: RiskFactor[] = [];

    // Location-based risk
    factors.push(this.assessLocationRisk(context));

    // Time-based risk
    factors.push(this.assessTimeRisk(context));

    // Device risk
    factors.push(this.assessDeviceRisk(context));

    // Behavior risk
    factors.push(this.assessBehaviorRisk(context));

    // IP reputation risk
    factors.push(this.assessIPRisk(context.ipAddress));

    // Velocity risk (rapid access patterns)
    factors.push(this.assessVelocityRisk(context));

    // Calculate weighted average
    const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
    const weightedScore = factors.reduce((sum, f) => sum + f.score * f.weight, 0);
    const riskScore = Math.round(weightedScore / totalWeight);

    // Update session risk profile
    this.updateSessionRisk(context.sessionId || context.userId, context.userId, riskScore, factors);

    return Math.min(100, Math.max(0, riskScore));
  }

  /**
   * Assess location-based risk
   */
  private assessLocationRisk(context: ZeroTrustContext): RiskFactor {
    let score = 0;

    if (!context.location) {
      score = 30; // Unknown location is moderately risky
    } else {
      const baseline = this.userBaselines.get(context.userId);
      if (baseline) {
        const isTypicalLocation = baseline.typicalLocations.includes(
          context.location.country || ''
        );
        score = isTypicalLocation ? 0 : 40;
      } else {
        score = 20; // New user, moderate risk
      }
    }

    return {
      type: 'location',
      score,
      weight: 0.2,
      details: { location: context.location },
    };
  }

  /**
   * Assess time-based risk
   */
  private assessTimeRisk(context: ZeroTrustContext): RiskFactor {
    const hour = context.timestamp.getHours();
    const baseline = this.userBaselines.get(context.userId);

    let score = 0;
    if (baseline) {
      const isTypicalHour = baseline.typicalHours.some(
        range => hour >= range.start && hour <= range.end
      );
      score = isTypicalHour ? 0 : 30;
    } else {
      // Consider off-hours (midnight to 5am) as higher risk
      score = hour >= 0 && hour < 5 ? 25 : 0;
    }

    return {
      type: 'time',
      score,
      weight: 0.1,
      details: { hour },
    };
  }

  /**
   * Assess device risk
   */
  private assessDeviceRisk(context: ZeroTrustContext): RiskFactor {
    if (!context.deviceId) {
      return { type: 'device', score: 40, weight: 0.15 };
    }

    const baseline = this.userBaselines.get(context.userId);
    if (baseline) {
      const isKnownDevice = baseline.typicalDevices.includes(context.deviceId);
      return {
        type: 'device',
        score: isKnownDevice ? 0 : 35,
        weight: 0.15,
        details: { deviceId: context.deviceId, known: isKnownDevice },
      };
    }

    return { type: 'device', score: 20, weight: 0.15 };
  }

  /**
   * Assess behavior risk
   */
  private assessBehaviorRisk(context: ZeroTrustContext): RiskFactor {
    const score = this.getBehaviorScore(context.userId);
    return {
      type: 'behavior',
      score,
      weight: 0.25,
    };
  }

  /**
   * Get behavior score for user
   */
  private getBehaviorScore(userId: string): number {
    const history = this.accessHistory.get(userId) || [];
    if (history.length === 0) return 15;

    // Analyze recent behavior patterns
    const recentHistory = history.filter(
      h => Date.now() - h.timestamp.getTime() < 3600000 // Last hour
    );

    if (recentHistory.length > 100) {
      return 60; // Unusually high activity
    }

    // Check for unusual resource access patterns
    const resources = new Set(recentHistory.map(h => h.resource));
    if (resources.size > 20) {
      return 40; // Accessing many different resources
    }

    return 0;
  }

  /**
   * Assess IP reputation risk
   */
  private assessIPRisk(ipAddress: string): RiskFactor {
    // In production, this would check against threat intelligence feeds
    // For now, basic checks

    let score = 0;

    // Check for known bad patterns
    if (ipAddress.startsWith('10.') || ipAddress.startsWith('192.168.') || ipAddress.startsWith('172.')) {
      score = 0; // Internal IP
    } else if (this.isKnownBadIP(ipAddress)) {
      score = 80;
    }

    return {
      type: 'ip-reputation',
      score,
      weight: 0.15,
      details: { ipAddress },
    };
  }

  /**
   * Check if IP is in blocklist
   */
  private isKnownBadIP(ip: string): boolean {
    const blocked = this.blockedEntities.get(`ip:${ip}`);
    return !!blocked && blocked.expiresAt > new Date();
  }

  /**
   * Assess velocity risk
   */
  private assessVelocityRisk(context: ZeroTrustContext): RiskFactor {
    const history = this.accessHistory.get(context.userId) || [];
    const recentRequests = history.filter(
      h => Date.now() - h.timestamp.getTime() < 60000 // Last minute
    );

    let score = 0;
    if (recentRequests.length > 30) {
      score = 50; // Very high request rate
    } else if (recentRequests.length > 15) {
      score = 25; // Elevated request rate
    }

    return {
      type: 'velocity',
      score,
      weight: 0.15,
      details: { requestCount: recentRequests.length, period: '1 minute' },
    };
  }

  /**
   * Update session risk profile
   */
  private updateSessionRisk(
    sessionId: string,
    userId: string,
    riskScore: number,
    factors: RiskFactor[]
  ): void {
    const existing = this.sessionRisks.get(sessionId);
    const anomalies: string[] = [];

    // Detect anomalies
    for (const factor of factors) {
      if (factor.score >= 40) {
        anomalies.push(`High risk in ${factor.type}: ${factor.score}`);
      }
    }

    this.sessionRisks.set(sessionId, {
      sessionId,
      userId,
      riskScore,
      factors,
      lastUpdated: new Date(),
      anomalies,
    });

    // Emit event if risk is elevated
    if (riskScore >= this.RISK_THRESHOLD_MEDIUM) {
      this.emitSecurityEvent({
        id: crypto.randomUUID(),
        type: 'suspicious-activity',
        severity: riskScore >= this.RISK_THRESHOLD_HIGH ? 'high' : 'medium',
        timestamp: new Date(),
        source: 'zero-trust',
        userId,
        outcome: 'success',
        details: {
          sessionId,
          riskScore,
          factors: factors.map(f => ({ type: f.type, score: f.score })),
          anomalies,
        },
      });
    }
  }

  /**
   * Record access attempt
   */
  private recordAccessAttempt(context: ZeroTrustContext, allowed: boolean): void {
    const history = this.accessHistory.get(context.userId) || [];

    history.push({
      timestamp: context.timestamp,
      resource: context.resource,
      action: context.action,
    });

    // Keep only last 1000 entries
    if (history.length > 1000) {
      history.splice(0, history.length - 1000);
    }

    this.accessHistory.set(context.userId, history);
  }

  /**
   * Check if entity is blocked
   */
  private checkBlocked(context: ZeroTrustContext): { blocked: boolean; reason: string } {
    const checks = [
      { key: `ip:${context.ipAddress}`, type: 'IP address' },
      { key: `user:${context.userId}`, type: 'User' },
      { key: `device:${context.deviceId}`, type: 'Device' },
    ];

    for (const check of checks) {
      const blocked = this.blockedEntities.get(check.key);
      if (blocked && blocked.expiresAt > new Date()) {
        return {
          blocked: true,
          reason: `${check.type} is blocked: ${blocked.reason}`,
        };
      }
    }

    return { blocked: false, reason: '' };
  }

  /**
   * Block an entity
   */
  blockEntity(
    identifier: string,
    type: 'ip' | 'user' | 'device',
    reason: string,
    durationMinutes: number = 60
  ): void {
    const key = `${type}:${identifier}`;
    this.blockedEntities.set(key, {
      type,
      expiresAt: new Date(Date.now() + durationMinutes * 60 * 1000),
      reason,
    });

    this.emitSecurityEvent({
      id: crypto.randomUUID(),
      type: 'access-denied',
      severity: 'high',
      timestamp: new Date(),
      source: 'zero-trust',
      outcome: 'blocked',
      details: {
        type,
        identifier,
        reason,
        durationMinutes,
      },
    });
  }

  /**
   * Quarantine an entity for investigation
   */
  quarantineEntity(identifier: string, type: 'ip' | 'user' | 'device', reason: string): void {
    // Block for 24 hours for investigation
    this.blockEntity(identifier, type, `Quarantined: ${reason}`, 1440);
  }

  /**
   * Unblock an entity
   */
  unblockEntity(identifier: string, type: 'ip' | 'user' | 'device'): void {
    const key = `${type}:${identifier}`;
    this.blockedEntities.delete(key);
  }

  /**
   * Update user behavior baseline
   */
  updateBaseline(
    userId: string,
    data: Partial<BehaviorBaseline>
  ): void {
    const existing = this.userBaselines.get(userId) || {
      userId,
      typicalLocations: [],
      typicalHours: [],
      typicalDevices: [],
      averageRequestRate: 0,
      lastUpdated: new Date(),
    };

    this.userBaselines.set(userId, {
      ...existing,
      ...data,
      lastUpdated: new Date(),
    });
  }

  /**
   * Get session risk profile
   */
  getSessionRisk(sessionId: string): SessionRiskProfile | undefined {
    return this.sessionRisks.get(sessionId);
  }

  /**
   * Clear session risk profile
   */
  clearSessionRisk(sessionId: string): void {
    this.sessionRisks.delete(sessionId);
  }

  /**
   * Load default policies
   */
  private loadDefaultPolicies(): void {
    // Policy: Block high-risk access
    this.addPolicy({
      id: 'block-high-risk',
      name: 'Block High Risk Access',
      enabled: true,
      conditions: [
        { type: 'risk-score', operator: 'greater-than', value: 80 },
      ],
      actions: [
        { type: 'deny' },
        { type: 'log' },
        { type: 'alert' },
      ],
      priority: 1,
    });

    // Policy: Require MFA for medium-risk
    this.addPolicy({
      id: 'mfa-medium-risk',
      name: 'Require MFA for Medium Risk',
      enabled: true,
      conditions: [
        { type: 'risk-score', operator: 'greater-than', value: 50 },
        { type: 'risk-score', operator: 'less-than', value: 80 },
      ],
      actions: [
        { type: 'mfa-required' },
        { type: 'log' },
      ],
      priority: 2,
    });

    // Policy: Block after hours for sensitive resources
    this.addPolicy({
      id: 'after-hours-sensitive',
      name: 'Restrict After Hours Sensitive Access',
      enabled: true,
      conditions: [
        { type: 'time', operator: 'less-than', value: 6 },
        { type: 'resource', operator: 'contains', value: '/admin' },
      ],
      actions: [
        { type: 'step-up-auth' },
        { type: 'log' },
      ],
      priority: 3,
    });

    // Policy: Log all access
    this.addPolicy({
      id: 'log-all-access',
      name: 'Log All Access',
      enabled: true,
      conditions: [],
      actions: [
        { type: 'log' },
      ],
      priority: 100,
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
   * Validate continuous authentication
   */
  async validateContinuousAuth(
    sessionId: string,
    context: ZeroTrustContext
  ): Promise<{ valid: boolean; reason?: string; action?: ZeroTrustAction }> {
    const sessionRisk = this.sessionRisks.get(sessionId);

    if (!sessionRisk) {
      return { valid: true };
    }

    // Check if risk has escalated significantly
    const currentRisk = await this.calculateRiskScore(context);
    const riskIncrease = currentRisk - sessionRisk.riskScore;

    if (riskIncrease > 30) {
      return {
        valid: false,
        reason: 'Risk score increased significantly during session',
        action: { type: 'step-up-auth' },
      };
    }

    if (currentRisk >= this.RISK_THRESHOLD_HIGH && sessionRisk.riskScore < this.RISK_THRESHOLD_HIGH) {
      return {
        valid: false,
        reason: 'Session risk escalated to high level',
        action: { type: 'deny' },
      };
    }

    return { valid: true };
  }

  /**
   * Get security posture summary
   */
  getSecurityPosture(): {
    activeSessions: number;
    highRiskSessions: number;
    blockedEntities: number;
    recentAlerts: number;
  } {
    const highRiskSessions = Array.from(this.sessionRisks.values())
      .filter(s => s.riskScore >= this.RISK_THRESHOLD_HIGH).length;

    const activeBlocks = Array.from(this.blockedEntities.values())
      .filter(b => b.expiresAt > new Date()).length;

    return {
      activeSessions: this.sessionRisks.size,
      highRiskSessions,
      blockedEntities: activeBlocks,
      recentAlerts: 0, // Would be populated from security events
    };
  }
}

// Factory function
export function createZeroTrustService(): ZeroTrustService {
  return new ZeroTrustService();
}

export default ZeroTrustService;
