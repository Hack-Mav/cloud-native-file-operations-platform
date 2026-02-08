import { Request, Response, NextFunction } from 'express';

interface WAFRule {
  name: string;
  pattern: RegExp;
  action: 'block' | 'log' | 'challenge';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
}

interface SecurityEvent {
  timestamp: string;
  correlationId: string;
  ip: string;
  userAgent: string;
  rule: string;
  action: string;
  severity: string;
  url: string;
  method: string;
}

class WebApplicationFirewall {
  private rules: WAFRule[] = [];
  private blockedIPs: Set<string> = new Set();
  private suspiciousIPs: Map<string, number> = new Map();
  private readonly MAX_VIOLATIONS = 5;
  private readonly BLOCK_DURATION = 3600000; // 1 hour in milliseconds

  constructor() {
    this.initializeDefaultRules();
  }

  private initializeDefaultRules(): void {
    this.rules = [
      // SQL Injection Detection
      {
        name: 'SQL_INJECTION',
        pattern: /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b)|('|(\\x27)|(\\x2D\\x2D))/i,
        action: 'block',
        severity: 'critical',
        description: 'SQL injection attempt detected'
      },
      
      // XSS Detection
      {
        name: 'XSS_ATTACK',
        pattern: /(<script[^>]*>.*?<\/script>)|(<iframe[^>]*>)|(<object[^>]*>)|(<embed[^>]*>)|(javascript:)|(vbscript:)|(onload=)|(onerror=)/i,
        action: 'block',
        severity: 'high',
        description: 'Cross-site scripting attempt detected'
      },
      
      // Path Traversal
      {
        name: 'PATH_TRAVERSAL',
        pattern: /(\.\.\/)|(\.\.\x5c)|(\.\.%2f)|(\.\.%5c)/i,
        action: 'block',
        severity: 'high',
        description: 'Path traversal attempt detected'
      },
      
      // Command Injection
      {
        name: 'COMMAND_INJECTION',
        pattern: /(\||;|&|`|\$\(|\${|<|>)/,
        action: 'block',
        severity: 'critical',
        description: 'Command injection attempt detected'
      },
      
      // Suspicious User Agents
      {
        name: 'SUSPICIOUS_USER_AGENT',
        pattern: /(sqlmap|nikto|nmap|masscan|nessus|openvas|w3af|burp|owasp|zap)/i,
        action: 'block',
        severity: 'medium',
        description: 'Suspicious user agent detected'
      },
      
      // Large Request Body
      {
        name: 'LARGE_REQUEST_BODY',
        pattern: /.{10000,}/,
        action: 'log',
        severity: 'medium',
        description: 'Unusually large request body'
      },
      
      // Suspicious Headers
      {
        name: 'SUSPICIOUS_HEADERS',
        pattern: /(x-forwarded-for.*,.*,)|(x-real-ip.*,)|(x-originating-ip)/i,
        action: 'log',
        severity: 'low',
        description: 'Suspicious header manipulation detected'
      }
    ];
  }

  checkRequest(req: Request): { blocked: boolean; violations: string[] } {
    const violations: string[] = [];
    const clientIP = this.getClientIP(req);
    
    // Check if IP is already blocked
    if (this.blockedIPs.has(clientIP)) {
      return { blocked: true, violations: ['IP_BLOCKED'] };
    }

    // Check all WAF rules
    for (const rule of this.rules) {
      if (this.checkRule(req, rule)) {
        violations.push(rule.name);
        
        this.logSecurityEvent({
          timestamp: new Date().toISOString(),
          correlationId: req.correlationId,
          ip: clientIP,
          userAgent: req.headers['user-agent'] || 'unknown',
          rule: rule.name,
          action: rule.action,
          severity: rule.severity,
          url: req.originalUrl,
          method: req.method
        });

        if (rule.action === 'block') {
          this.handleViolation(clientIP);
          return { blocked: true, violations };
        }
      }
    }

    return { blocked: false, violations };
  }

  private checkRule(req: Request, rule: WAFRule): boolean {
    const targets = [
      req.originalUrl,
      req.headers['user-agent'] || '',
      JSON.stringify(req.query),
      JSON.stringify(req.body || {}),
      JSON.stringify(req.headers)
    ];

    return targets.some(target => rule.pattern.test(target));
  }

  private handleViolation(ip: string): void {
    const currentViolations = this.suspiciousIPs.get(ip) || 0;
    const newViolations = currentViolations + 1;
    
    this.suspiciousIPs.set(ip, newViolations);
    
    if (newViolations >= this.MAX_VIOLATIONS) {
      this.blockedIPs.add(ip);
      console.warn(`IP ${ip} blocked due to ${newViolations} security violations`);
      
      // Auto-unblock after duration
      setTimeout(() => {
        this.blockedIPs.delete(ip);
        this.suspiciousIPs.delete(ip);
        console.info(`IP ${ip} automatically unblocked`);
      }, this.BLOCK_DURATION);
    }
  }

  private getClientIP(req: Request): string {
    return req.headers['x-forwarded-for'] as string ||
           req.headers['x-real-ip'] as string ||
           req.connection.remoteAddress ||
           req.ip ||
           'unknown';
  }

  private logSecurityEvent(event: SecurityEvent): void {
    console.warn('Security Event:', JSON.stringify(event));
    
    // In production, send to security monitoring system
    // await securityMonitoring.sendAlert(event);
  }

  addCustomRule(rule: WAFRule): void {
    this.rules.push(rule);
  }

  removeRule(ruleName: string): void {
    this.rules = this.rules.filter(rule => rule.name !== ruleName);
  }

  blockIP(ip: string, duration?: number): void {
    this.blockedIPs.add(ip);
    
    if (duration) {
      setTimeout(() => {
        this.blockedIPs.delete(ip);
      }, duration);
    }
  }

  unblockIP(ip: string): void {
    this.blockedIPs.delete(ip);
    this.suspiciousIPs.delete(ip);
  }

  getBlockedIPs(): string[] {
    return Array.from(this.blockedIPs);
  }

  getSuspiciousIPs(): Array<{ ip: string; violations: number }> {
    return Array.from(this.suspiciousIPs.entries()).map(([ip, violations]) => ({
      ip,
      violations
    }));
  }
}

const waf = new WebApplicationFirewall();

export function wafMiddleware(req: Request, res: Response, next: NextFunction): void {
  try {
    const result = waf.checkRequest(req);
    
    if (result.blocked) {
      return res.status(403).json({
        error: {
          code: 'SECURITY_VIOLATION',
          message: 'Request blocked by Web Application Firewall',
          violations: result.violations,
          timestamp: new Date().toISOString(),
          requestId: req.correlationId
        }
      });
    }

    // Add security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    next();
  } catch (error) {
    console.error('WAF middleware error:', error);
    // Continue on error (fail open for availability)
    next();
  }
}

export { waf };