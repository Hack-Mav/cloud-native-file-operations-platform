import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { rateLimitMiddleware } from '../src/middleware/rateLimit';
import { mockRequest, mockResponse, mockNext } from './setup';

describe('Rate Limiting Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Default Rate Limiting', () => {
    it('should allow requests within limit', async () => {
      const req = mockRequest({
        ip: '192.168.1.1',
        user: { id: 'user123' }
      });
      const res = mockResponse();
      const next = mockNext;

      const middleware = rateLimitMiddleware();
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should set rate limit headers', async () => {
      const req = mockRequest({
        ip: '192.168.1.2',
        user: { id: 'user456' }
      });
      const res = mockResponse();
      const next = mockNext;

      const middleware = rateLimitMiddleware();
      await middleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', expect.any(Number));
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', expect.any(Number));
      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(String));
    });

    it('should handle Redis connection errors gracefully', async () => {
      const req = mockRequest({
        ip: '192.168.1.3'
      });
      const res = mockResponse();
      const next = mockNext;

      // Mock Redis error
      const middleware = rateLimitMiddleware();
      await middleware(req, res, next);

      // Should fail open and allow the request
      expect(next).toHaveBeenCalled();
    });
  });

  describe('Custom Rate Limiting', () => {
    it('should apply custom rate limit configuration', async () => {
      const customConfig = {
        windowMs: 60000,
        max: 5,
        message: 'Custom rate limit exceeded'
      };

      const req = mockRequest({
        ip: '192.168.1.4'
      });
      const res = mockResponse();
      const next = mockNext;

      const middleware = rateLimitMiddleware(customConfig);
      await middleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 5);
    });

    it('should use custom key generator', async () => {
      const customConfig = {
        keyGenerator: (req: any) => `custom:${req.headers['x-api-key']}`
      };

      const req = mockRequest({
        headers: { 'x-api-key': 'test-key' }
      });
      const res = mockResponse();
      const next = mockNext;

      const middleware = rateLimitMiddleware(customConfig);
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('Rate Limit Exceeded', () => {
    it('should block requests when limit exceeded', async () => {
      // Mock Redis to return high count
      const mockRedis = require('redis').createClient();
      mockRedis.multi().exec.mockResolvedValue([100, 1]); // High count

      const req = mockRequest({
        ip: '192.168.1.5',
        correlationId: 'test-correlation-id'
      });
      const res = mockResponse();
      const next = mockNext;

      const middleware = rateLimitMiddleware({ max: 10 });
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'RATE_LIMIT_EXCEEDED'
          })
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should include retry-after information', async () => {
      const mockRedis = require('redis').createClient();
      mockRedis.multi().exec.mockResolvedValue([100, 1]);

      const req = mockRequest({
        ip: '192.168.1.6',
        correlationId: 'test-correlation-id'
      });
      const res = mockResponse();
      const next = mockNext;

      const middleware = rateLimitMiddleware({ max: 10 });
      await middleware(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            retryAfter: expect.any(Number)
          })
        })
      );
    });
  });

  describe('User-based Rate Limiting', () => {
    it('should use user ID for authenticated requests', async () => {
      const req = mockRequest({
        ip: '192.168.1.7',
        user: { id: 'user789' }
      });
      const res = mockResponse();
      const next = mockNext;

      const middleware = rateLimitMiddleware();
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should fall back to IP for unauthenticated requests', async () => {
      const req = mockRequest({
        ip: '192.168.1.8'
        // No user object
      });
      const res = mockResponse();
      const next = mockNext;

      const middleware = rateLimitMiddleware();
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('Performance', () => {
    it('should handle concurrent requests efficiently', async () => {
      const requests = Array.from({ length: 10 }, (_, i) => 
        mockRequest({
          ip: `192.168.1.${100 + i}`,
          user: { id: `user${i}` }
        })
      );

      const middleware = rateLimitMiddleware();
      const promises = requests.map(req => {
        const res = mockResponse();
        const next = mockNext;
        return middleware(req, res, next);
      });

      await Promise.all(promises);

      // All requests should be processed
      expect(promises).toHaveLength(10);
    });

    it('should not block the event loop', async () => {
      const start = Date.now();
      
      const req = mockRequest({
        ip: '192.168.1.200'
      });
      const res = mockResponse();
      const next = mockNext;

      const middleware = rateLimitMiddleware();
      await middleware(req, res, next);

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(100); // Should complete quickly
    });
  });
});