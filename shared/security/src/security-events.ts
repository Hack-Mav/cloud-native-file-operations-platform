/**
 * Security Event Logging and Alerting Module
 * Provides centralized security event management with alerting capabilities
 */

import * as crypto from 'crypto';
import {
  SecurityEvent,
  SecurityEventType,
  SecuritySeverity,
} from './types';

interface AlertRule {
  id: string;
  name: string;
  enabled: boolean;
  eventTypes: SecurityEventType[];
  severities: SecuritySeverity[];
  threshold: number;
  windowMinutes: number;
  actions: AlertAction[];
  conditions?: Record<string, unknown>;
}

interface AlertAction {
  type: 'email' | 'webhook' | 'slack' | 'pagerduty' | 'log';
  config: Record<string, unknown>;
}

interface Alert {
  id: string;
  ruleId: string;
  ruleName: string;
  triggeredAt: Date;
  severity: SecuritySeverity;
  events: SecurityEvent[];
  status: 'active' | 'acknowledged' | 'resolved';
  acknowledgedBy?: string;
  resolvedBy?: string;
  notes?: string;
}

interface EventAggregation {
  count: number;
  firstSeen: Date;
  lastSeen: Date;
  events: SecurityEvent[];
}

type AlertCallback = (alert: Alert) => void | Promise<void>;

export class SecurityEventService {
  private events: SecurityEvent[];
  private alertRules: Map<string, AlertRule>;
  private activeAlerts: Map<string, Alert>;
  private eventAggregations: Map<string, EventAggregation>;
  private alertCallbacks: AlertCallback[];
  private maxEvents: number;
  private cleanupInterval: NodeJS.Timeout | null;

  constructor(maxEvents: number = 10000) {
    this.events = [];
    this.alertRules = new Map();
    this.activeAlerts = new Map();
    this.eventAggregations = new Map();
    this.alertCallbacks = [];
    this.maxEvents = maxEvents;
    this.cleanupInterval = null;

    this.loadDefaultAlertRules();
    this.startCleanupJob();
  }

  /**
   * Log a security event
   */
  logEvent(event: Omit<SecurityEvent, 'id'>): SecurityEvent {
    const fullEvent: SecurityEvent = {
      ...event,
      id: crypto.randomUUID(),
    };

    this.events.push(fullEvent);

    // Trim events if over limit
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    // Update aggregations
    this.updateAggregations(fullEvent);

    // Check alert rules
    this.checkAlertRules(fullEvent);

    return fullEvent;
  }

  /**
   * Create security event helper
   */
  createEvent(
    type: SecurityEventType,
    severity: SecuritySeverity,
    source: string,
    outcome: 'success' | 'failure' | 'blocked',
    details: Record<string, unknown>,
    options?: {
      userId?: string;
      ipAddress?: string;
      resource?: string;
      action?: string;
      correlationId?: string;
      tenantId?: string;
    }
  ): SecurityEvent {
    return this.logEvent({
      type,
      severity,
      timestamp: new Date(),
      source,
      outcome,
      details,
      ...options,
    });
  }

  /**
   * Log authentication event
   */
  logAuthEvent(
    outcome: 'success' | 'failure',
    userId: string,
    ipAddress: string,
    details: Record<string, unknown>
  ): SecurityEvent {
    return this.createEvent(
      'authentication',
      outcome === 'failure' ? 'medium' : 'low',
      'auth-service',
      outcome,
      details,
      { userId, ipAddress }
    );
  }

  /**
   * Log authorization event
   */
  logAuthzEvent(
    outcome: 'success' | 'failure' | 'blocked',
    userId: string,
    resource: string,
    action: string,
    details: Record<string, unknown>
  ): SecurityEvent {
    return this.createEvent(
      'authorization',
      outcome === 'success' ? 'low' : 'medium',
      'authz-service',
      outcome,
      details,
      { userId, resource, action }
    );
  }

  /**
   * Log suspicious activity
   */
  logSuspiciousActivity(
    severity: SecuritySeverity,
    source: string,
    details: Record<string, unknown>,
    options?: {
      userId?: string;
      ipAddress?: string;
      resource?: string;
    }
  ): SecurityEvent {
    return this.createEvent(
      'suspicious-activity',
      severity,
      source,
      'blocked',
      details,
      options
    );
  }

  /**
   * Log intrusion attempt
   */
  logIntrusionAttempt(
    category: string,
    severity: SecuritySeverity,
    source: string,
    ipAddress: string,
    details: Record<string, unknown>
  ): SecurityEvent {
    return this.createEvent(
      'intrusion-attempt',
      severity,
      source,
      'blocked',
      { category, ...details },
      { ipAddress }
    );
  }

  /**
   * Log data breach
   */
  logDataBreach(
    affectedData: string[],
    severity: SecuritySeverity,
    details: Record<string, unknown>
  ): SecurityEvent {
    return this.createEvent(
      'data-breach',
      severity,
      'security-monitor',
      'failure',
      { affectedData, ...details }
    );
  }

  /**
   * Log policy violation
   */
  logPolicyViolation(
    policyId: string,
    policyName: string,
    userId: string,
    details: Record<string, unknown>
  ): SecurityEvent {
    return this.createEvent(
      'policy-violation',
      'medium',
      'policy-engine',
      'blocked',
      { policyId, policyName, ...details },
      { userId }
    );
  }

  /**
   * Log vulnerability detection
   */
  logVulnerability(
    vulnerabilityId: string,
    severity: SecuritySeverity,
    component: string,
    details: Record<string, unknown>
  ): SecurityEvent {
    return this.createEvent(
      'vulnerability-detected',
      severity,
      'vulnerability-scanner',
      'failure',
      { vulnerabilityId, component, ...details }
    );
  }

  /**
   * Add alert rule
   */
  addAlertRule(rule: AlertRule): void {
    this.alertRules.set(rule.id, rule);
  }

  /**
   * Remove alert rule
   */
  removeAlertRule(ruleId: string): void {
    this.alertRules.delete(ruleId);
  }

  /**
   * Get all alert rules
   */
  getAlertRules(): AlertRule[] {
    return Array.from(this.alertRules.values());
  }

  /**
   * Register alert callback
   */
  onAlert(callback: AlertCallback): void {
    this.alertCallbacks.push(callback);
  }

  /**
   * Update event aggregations
   */
  private updateAggregations(event: SecurityEvent): void {
    const keys = [
      `type:${event.type}`,
      `severity:${event.severity}`,
      `source:${event.source}`,
      `outcome:${event.outcome}`,
    ];

    if (event.userId) {
      keys.push(`user:${event.userId}`);
    }

    if (event.ipAddress) {
      keys.push(`ip:${event.ipAddress}`);
    }

    for (const key of keys) {
      const agg = this.eventAggregations.get(key) || {
        count: 0,
        firstSeen: event.timestamp,
        lastSeen: event.timestamp,
        events: [],
      };

      agg.count++;
      agg.lastSeen = event.timestamp;
      agg.events.push(event);

      // Keep only last 100 events per aggregation
      if (agg.events.length > 100) {
        agg.events = agg.events.slice(-100);
      }

      this.eventAggregations.set(key, agg);
    }
  }

  /**
   * Check alert rules for an event
   */
  private checkAlertRules(event: SecurityEvent): void {
    for (const rule of this.alertRules.values()) {
      if (!rule.enabled) continue;

      // Check if event matches rule criteria
      if (!this.matchesRule(event, rule)) continue;

      // Get matching events in window
      const windowStart = new Date(Date.now() - rule.windowMinutes * 60 * 1000);
      const matchingEvents = this.events.filter(
        e => e.timestamp >= windowStart && this.matchesRule(e, rule)
      );

      // Check threshold
      if (matchingEvents.length >= rule.threshold) {
        this.triggerAlert(rule, matchingEvents);
      }
    }
  }

  /**
   * Check if event matches rule criteria
   */
  private matchesRule(event: SecurityEvent, rule: AlertRule): boolean {
    if (rule.eventTypes.length > 0 && !rule.eventTypes.includes(event.type)) {
      return false;
    }

    if (rule.severities.length > 0 && !rule.severities.includes(event.severity)) {
      return false;
    }

    if (rule.conditions) {
      for (const [key, value] of Object.entries(rule.conditions)) {
        const eventValue = (event as Record<string, unknown>)[key];
        if (eventValue !== value) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Trigger an alert
   */
  private async triggerAlert(rule: AlertRule, events: SecurityEvent[]): Promise<void> {
    // Check if alert already exists for this rule
    const existingAlert = Array.from(this.activeAlerts.values()).find(
      a => a.ruleId === rule.id && a.status === 'active'
    );

    if (existingAlert) {
      // Update existing alert
      existingAlert.events = events;
      return;
    }

    const alert: Alert = {
      id: crypto.randomUUID(),
      ruleId: rule.id,
      ruleName: rule.name,
      triggeredAt: new Date(),
      severity: this.getHighestSeverity(events),
      events,
      status: 'active',
    };

    this.activeAlerts.set(alert.id, alert);

    // Execute alert actions
    for (const action of rule.actions) {
      await this.executeAlertAction(alert, action);
    }

    // Notify callbacks
    for (const callback of this.alertCallbacks) {
      try {
        await callback(alert);
      } catch (error) {
        console.error('Alert callback error:', error);
      }
    }
  }

  /**
   * Execute alert action
   */
  private async executeAlertAction(alert: Alert, action: AlertAction): Promise<void> {
    switch (action.type) {
      case 'log':
        console.log(`[SECURITY ALERT] ${alert.ruleName}: ${alert.events.length} events`);
        break;

      case 'webhook':
        // In production, would send HTTP request
        console.log(`Would send webhook to ${action.config.url}`);
        break;

      case 'email':
        // In production, would send email
        console.log(`Would send email to ${action.config.recipients}`);
        break;

      case 'slack':
        // In production, would post to Slack
        console.log(`Would post to Slack channel ${action.config.channel}`);
        break;

      case 'pagerduty':
        // In production, would create PagerDuty incident
        console.log(`Would create PagerDuty incident`);
        break;
    }
  }

  /**
   * Get highest severity from events
   */
  private getHighestSeverity(events: SecurityEvent[]): SecuritySeverity {
    const severityOrder: SecuritySeverity[] = ['low', 'medium', 'high', 'critical'];
    let highestIndex = 0;

    for (const event of events) {
      const index = severityOrder.indexOf(event.severity);
      if (index > highestIndex) {
        highestIndex = index;
      }
    }

    return severityOrder[highestIndex];
  }

  /**
   * Acknowledge alert
   */
  acknowledgeAlert(alertId: string, userId: string, notes?: string): boolean {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) return false;

    alert.status = 'acknowledged';
    alert.acknowledgedBy = userId;
    alert.notes = notes;

    return true;
  }

  /**
   * Resolve alert
   */
  resolveAlert(alertId: string, userId: string, notes?: string): boolean {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) return false;

    alert.status = 'resolved';
    alert.resolvedBy = userId;
    if (notes) {
      alert.notes = (alert.notes || '') + '\n' + notes;
    }

    return true;
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values()).filter(a => a.status === 'active');
  }

  /**
   * Get all alerts
   */
  getAllAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * Get recent events
   */
  getRecentEvents(limit: number = 100): SecurityEvent[] {
    return this.events.slice(-limit);
  }

  /**
   * Query events
   */
  queryEvents(filter: {
    type?: SecurityEventType;
    severity?: SecuritySeverity;
    source?: string;
    userId?: string;
    ipAddress?: string;
    startTime?: Date;
    endTime?: Date;
    limit?: number;
  }): SecurityEvent[] {
    let results = this.events;

    if (filter.type) {
      results = results.filter(e => e.type === filter.type);
    }

    if (filter.severity) {
      results = results.filter(e => e.severity === filter.severity);
    }

    if (filter.source) {
      results = results.filter(e => e.source === filter.source);
    }

    if (filter.userId) {
      results = results.filter(e => e.userId === filter.userId);
    }

    if (filter.ipAddress) {
      results = results.filter(e => e.ipAddress === filter.ipAddress);
    }

    if (filter.startTime) {
      results = results.filter(e => e.timestamp >= filter.startTime!);
    }

    if (filter.endTime) {
      results = results.filter(e => e.timestamp <= filter.endTime!);
    }

    if (filter.limit) {
      results = results.slice(-filter.limit);
    }

    return results;
  }

  /**
   * Get event statistics
   */
  getStatistics(windowMinutes: number = 60): {
    total: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
    byOutcome: Record<string, number>;
    topSources: Array<{ source: string; count: number }>;
    topUsers: Array<{ userId: string; count: number }>;
    topIPs: Array<{ ip: string; count: number }>;
  } {
    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);
    const recentEvents = this.events.filter(e => e.timestamp >= windowStart);

    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    const byOutcome: Record<string, number> = {};
    const sourceCount: Record<string, number> = {};
    const userCount: Record<string, number> = {};
    const ipCount: Record<string, number> = {};

    for (const event of recentEvents) {
      byType[event.type] = (byType[event.type] || 0) + 1;
      bySeverity[event.severity] = (bySeverity[event.severity] || 0) + 1;
      byOutcome[event.outcome] = (byOutcome[event.outcome] || 0) + 1;
      sourceCount[event.source] = (sourceCount[event.source] || 0) + 1;

      if (event.userId) {
        userCount[event.userId] = (userCount[event.userId] || 0) + 1;
      }

      if (event.ipAddress) {
        ipCount[event.ipAddress] = (ipCount[event.ipAddress] || 0) + 1;
      }
    }

    const sortByCount = (obj: Record<string, number>) =>
      Object.entries(obj)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    return {
      total: recentEvents.length,
      byType,
      bySeverity,
      byOutcome,
      topSources: sortByCount(sourceCount).map(([source, count]) => ({ source, count })),
      topUsers: sortByCount(userCount).map(([userId, count]) => ({ userId, count })),
      topIPs: sortByCount(ipCount).map(([ip, count]) => ({ ip, count })),
    };
  }

  /**
   * Load default alert rules
   */
  private loadDefaultAlertRules(): void {
    // Alert on multiple failed authentications
    this.addAlertRule({
      id: 'brute-force-detection',
      name: 'Brute Force Detection',
      enabled: true,
      eventTypes: ['authentication'],
      severities: [],
      threshold: 5,
      windowMinutes: 5,
      actions: [
        { type: 'log', config: {} },
        { type: 'webhook', config: { url: '${SECURITY_WEBHOOK_URL}' } },
      ],
      conditions: { outcome: 'failure' },
    });

    // Alert on critical severity events
    this.addAlertRule({
      id: 'critical-events',
      name: 'Critical Security Events',
      enabled: true,
      eventTypes: [],
      severities: ['critical'],
      threshold: 1,
      windowMinutes: 1,
      actions: [
        { type: 'log', config: {} },
        { type: 'pagerduty', config: {} },
      ],
    });

    // Alert on intrusion attempts
    this.addAlertRule({
      id: 'intrusion-attempts',
      name: 'Multiple Intrusion Attempts',
      enabled: true,
      eventTypes: ['intrusion-attempt'],
      severities: [],
      threshold: 3,
      windowMinutes: 10,
      actions: [
        { type: 'log', config: {} },
        { type: 'email', config: { recipients: ['security@example.com'] } },
      ],
    });

    // Alert on data breaches
    this.addAlertRule({
      id: 'data-breach',
      name: 'Data Breach Detection',
      enabled: true,
      eventTypes: ['data-breach'],
      severities: [],
      threshold: 1,
      windowMinutes: 1,
      actions: [
        { type: 'log', config: {} },
        { type: 'pagerduty', config: {} },
        { type: 'email', config: { recipients: ['security@example.com', 'legal@example.com'] } },
      ],
    });
  }

  /**
   * Start cleanup job
   */
  private startCleanupJob(): void {
    // Clean up old aggregations every hour
    this.cleanupInterval = setInterval(() => {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

      for (const [key, agg] of this.eventAggregations) {
        if (agg.lastSeen < cutoff) {
          this.eventAggregations.delete(key);
        }
      }

      // Clean up resolved alerts older than 7 days
      const alertCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      for (const [id, alert] of this.activeAlerts) {
        if (alert.status === 'resolved' && alert.triggeredAt < alertCutoff) {
          this.activeAlerts.delete(id);
        }
      }
    }, 3600000);
  }

  /**
   * Stop the service
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Export events for compliance
   */
  exportEvents(startTime: Date, endTime: Date): SecurityEvent[] {
    return this.events.filter(
      e => e.timestamp >= startTime && e.timestamp <= endTime
    );
  }
}

// Factory function
export function createSecurityEventService(maxEvents?: number): SecurityEventService {
  return new SecurityEventService(maxEvents);
}

export default SecurityEventService;
