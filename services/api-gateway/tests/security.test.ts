import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { wafMiddleware, waf } from '../src/middleware/waf';
import { ddosProtectionMiddleware, ddosProtection } from '../src/middleware/ddosProtection';
import { mockRequest, mockResponse, mockNext } from './setup';

describe('Web Application Firewall (WAF)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('SQL Injection Detection', () => {
    it('should block SQL injection in URL', () => {
      const req = mockRequest({
        originalUrl: '/api/users?id=1 UNION SELECT * FROM users',
        correlationId: 'test-correlation-id'
      });
      const res = mockResponse();
      const next = mockNext;

      wafMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'SECURITY_VIOLATION',
            violations: expect.arrayContaining(['SQL_INJECTION'])
          })
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should block SQL injection in request body', () => {
      const req = mockRequest({
        body: {
          query: "'; DROP TABLE users; --"
        },
        correlationId: 'test-correlation-id'
      });
      const res = mockResponse();
      const next = mockNext;

      wafMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'SECURITY_VIOLATION'
          })
        })
      );
    });
  });

  describe('XSS Detection', () => {
    it('should block XSS in request parameters', () => {
      const req = mockRequest({
        query: {
          search: '<script>alert("xss")</script>'
        },
        correlationId: 'test-correlation-id'
      });
      const res = mockResponse();
      const next = mockNext;

      wafMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            violations: expect.arrayContaining(['XSS_ATTACK'])
          })
        })
      );
    });

    it('should block XSS in request body', () => {
      const req = mockRequest({
        body: {
          content: '<iframe src="javascript:alert(1)"></iframe>'
        },
        correlationId: 'test-correlation-id'
      });
      const res = mockResponse();
      const next = mockNext;

      wafMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('Path Traversal Detection', () => {
    it('should block path traversal attempts', () => {
      const req = mockRequest({
        originalUrl: '/api/files/../../etc/passwd',
        correlationId: 'test-correlation-id'
      });
      const res = mockResponse();
      const next = mockNext;

      wafMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            violations: expect.arrayContaining(['PATH_TRAVERSAL'])
          })
        })
      );
    });
  });

  describe('Suspicious User Agent Detection', () => {
    it('should block known attack tools', () => {
      const req = mockRequest({
        headers: {
          'user-agent': 'sqlmap/1.0'
        },
        correlationId: 'test-correlation-id'
      });
      const res = mockResponse();
      const next = mockNext;

      wafMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            violations: expect.arrayContaining(['SUSPICIOUS_USER_AGENT'])
          })
        })
      );
    });
  });

  describe('Legitimate Requests', () => {
    it('should allow legitimate requests', () => {
      const req = mockRequest({
        originalUrl: '/api/users/123',
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: {
          name: 'John Doe',
          email: 'john@example.com'
        }
      });
      const res = mockResponse();
      const next = mockNext;

      wafMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should set security headers for legitimate requests', () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext;

      wafMiddleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(res.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
      expect(res.setHeader).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
    });
  });

  describe('IP Blocking', () => {
    it('should block IPs after multiple violations', () => {
      const maliciousIP = '192.168.1.100';
      
      // Simulate multiple violations
      for (let i = 0; i < 6; i++) {
        const req = mockRequest({
          originalUrl: '/api/users?id=1 UNION SELECT',
          ip: maliciousIP,
          connection: { remoteAddress: maliciousIP },
          correlationId: `test-${i}`
        });
        const res = mockResponse();
        const next = mockNext;

        wafMiddleware(req, res, next);
      }

      // Next request from same IP should be blocked immediately
      const req = mockRequest({
        originalUrl: '/api/users/legitimate',
        ip: maliciousIP,
        connection: { remoteAddress: maliciousIP },
        correlationId: 'test-blocked'
      });
      const res = mockResponse();
      const next = mockNext;

      wafMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
    });
  });
});

describe('DDoS Protection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rate Limiting', () => {
    it('should allow requests within limits', async () => {
      const req = mockRequest({
        ip: '192.168.1.1',
        correlationId: 'test-correlation-id'
      });
      const res = mockResponse();
      const next = mockNext;

      await new Promise<void>((resolve) => {
        ddosProtectionMiddleware(req, res, (err?: any) => {
          if (!err) next();
          resolve();
        });
      });

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should block requests exceeding rate limits', async () => {
      // Mock ddosProtection to simulate rate limit exceeded
      const originalCheckRequest = ddosProtection.checkRequest;
      ddosProtection.checkRequest = jest.fn().mockResolvedValue({
        allowed: false,
        reason: 'RATE_LIMIT_EXCEEDED',
        retryAfter: 300
      });

      const req = mockRequest({
        ip: '192.168.1.2',
        correlationId: 'test-correlation-id'
      });
      const res = mockResponse();
      const next = mockNext;

      await new Promise<void>((resolve) => {
        ddosProtectionMiddleware(req, res, (err?: any) => {
          if (!err) next();
          resolve();
        });
      });

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'DDOS_PROTECTION',
            reason: 'RATE_LIMIT_EXCEEDED'
          })
        })
      );
      expect(res.setHeader).toHaveBeenCalledWith('Retry-After', 300);

      // Restore original method
      ddosProtection.checkRequest = originalCheckRequest;
    });
  });

  describe('Whitelist', () => {
    it('should allow whitelisted IPs', async () => {
      const req = mockRequest({
        ip: '127.0.0.1', // Localhost is whitelisted by default
        correlationId: 'test-correlation-id'
      });
      const res = mockResponse();
      const next = mockNext;

      await new Promise<void>((resolve) => {
        ddosProtectionMiddleware(req, res, (err?: any) => {
          if (!err) next();
          resolve();
        });
      });

      expect(next).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should fail open on errors', async () => {
      // Mock ddosProtection to throw an error
      const originalCheckRequest = ddosProtection.checkRequest;
      ddosProtection.checkRequest = jest.fn().mockRejectedValue(new Error('Redis error'));

      const req = mockRequest({
        ip: '192.168.1.3'
      });
      const res = mockResponse();
      const next = mockNext;

      await new Promise<void>((resolve) => {
        ddosProtectionMiddleware(req, res, (err?: any) => {
          if (!err) next();
          resolve();
        });
      });

      expect(next).toHaveBeenCalled();

      // Restore original method
      ddosProtection.checkRequest = originalCheckRequest;
    });
  });
});

describe('Security Integration', () => {
  it('should apply security middleware in correct order', () => {
    const req = mockRequest({
      originalUrl: '/api/users/123',
      headers: {
        'user-agent': 'Mozilla/5.0'
      },
      ip: '192.168.1.10'
    });
    const res = mockResponse();
    const next = mockNext;

    // DDoS protection first
    ddosProtectionMiddleware(req, res, () => {
      // Then WAF
      wafMiddleware(req, res, () => {
        next();
      });
    });

    expect(next).toHaveBeenCalled();
  });

  it('should handle multiple security violations', () => {
    const req = mockRequest({
      originalUrl: '/api/users?id=1 UNION SELECT',
      headers: {
        'user-agent': 'sqlmap/1.0'
      },
      correlationId: 'test-correlation-id'
    });
    const res = mockResponse();
    const next = mockNext;

    wafMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          violations: expect.arrayContaining(['SQL_INJECTION', 'SUSPICIOUS_USER_AGENT'])
        })
      })
    );
  });
});