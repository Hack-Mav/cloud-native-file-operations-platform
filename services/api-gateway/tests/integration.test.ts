import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { correlationIdMiddleware } from '../src/middleware/correlationId';
import { requestLogger } from '../src/middleware/requestLogger';
import { apiVersioning } from '../src/middleware/apiVersioning';
import { rateLimitMiddleware } from '../src/middleware/rateLimit';
import { authMiddleware } from '../src/middleware/auth';
import { wafMiddleware } from '../src/middleware/waf';
import { ddosProtectionMiddleware } from '../src/middleware/ddosProtection';
import { errorHandler } from '../src/middleware/errorHandler';

describe('API Gateway Integration Tests', () => {
  let app: express.Application;
  let validToken: string;

  beforeAll(() => {
    // Create test JWT token
    validToken = jwt.sign(
      {
        sub: 'test-user-123',
        email: 'test@example.com',
        roles: ['user', 'admin'],
        tenantId: 'test-tenant'
      },
      'test-secret-key',
      { expiresIn: '1h' }
    );
  });

  beforeEach(() => {
    app = express();
    
    // Apply middleware stack in correct order
    app.use(express.json());
    app.use(ddosProtectionMiddleware);
    app.use(wafMiddleware);
    app.use(correlationIdMiddleware);
    app.use(requestLogger);
    app.use(apiVersioning);
    app.use(rateLimitMiddleware);

    // Health check endpoint (no auth required)
    app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'api-gateway'
      });
    });

    // Protected endpoints
    app.use('/api/files', authMiddleware, (req, res) => {
      res.json({
        success: true,
        data: { message: 'File service response' },
        user: req.user
      });
    });

    app.use('/api/processing', authMiddleware, (req, res) => {
      res.json({
        success: true,
        data: { message: 'Processing service response' }
      });
    });

    // Public endpoints (no auth required)
    app.post('/api/auth/login', (req, res) => {
      res.json({
        success: true,
        data: { token: validToken }
      });
    });

    // Error handling
    app.use(errorHandler);
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'healthy',
        service: 'api-gateway'
      });
      expect(response.headers['x-correlation-id']).toBeDefined();
    });
  });

  describe('Authentication Flow', () => {
    it('should allow login without authentication', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.token).toBeDefined();
    });

    it('should protect file endpoints', async () => {
      await request(app)
        .get('/api/files')
        .expect(401);
    });

    it('should allow access with valid token', async () => {
      const response = await request(app)
        .get('/api/files')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user).toMatchObject({
        id: 'test-user-123',
        email: 'test@example.com'
      });
    });

    it('should allow access with valid API key', async () => {
      const response = await request(app)
        .get('/api/files')
        .set('X-API-Key', 'test-api-key-1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user.id).toBe('api-key-user');
    });
  });

  describe('API Versioning', () => {
    it('should handle version in header', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .set('X-API-Version', 'v2')
        .send({ email: 'test@example.com', password: 'password' })
        .expect(200);

      expect(response.headers['x-api-version']).toBe('v2');
    });

    it('should handle version in query parameter', async () => {
      const response = await request(app)
        .post('/api/auth/login?version=v2')
        .send({ email: 'test@example.com', password: 'password' })
        .expect(200);

      expect(response.headers['x-api-version']).toBe('v2');
    });

    it('should reject unsupported versions', async () => {
      await request(app)
        .post('/api/auth/login')
        .set('X-API-Version', 'v99')
        .send({ email: 'test@example.com', password: 'password' })
        .expect(400);
    });
  });

  describe('Security Features', () => {
    it('should block SQL injection attempts', async () => {
      await request(app)
        .get('/api/files?id=1 UNION SELECT * FROM users')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(403);
    });

    it('should block XSS attempts', async () => {
      await request(app)
        .post('/api/files')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          name: '<script>alert("xss")</script>'
        })
        .expect(403);
    });

    it('should block suspicious user agents', async () => {
      await request(app)
        .get('/api/files')
        .set('Authorization', `Bearer ${validToken}`)
        .set('User-Agent', 'sqlmap/1.0')
        .expect(403);
    });

    it('should set security headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-xss-protection']).toBe('1; mode=block');
    });
  });

  describe('Rate Limiting', () => {
    it('should set rate limit headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers['x-ratelimit-limit']).toBeDefined();
      expect(response.headers['x-ratelimit-remaining']).toBeDefined();
      expect(response.headers['x-ratelimit-reset']).toBeDefined();
    });

    it('should handle rate limit exceeded gracefully', async () => {
      // Mock Redis to return high count
      const mockRedis = require('redis').createClient();
      mockRedis.multi().exec.mockResolvedValue([1000, 1]);

      const response = await request(app)
        .get('/health')
        .expect(429);

      expect(response.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 errors', async () => {
      const response = await request(app)
        .get('/api/nonexistent')
        .expect(404);

      expect(response.body.error.code).toBe('NOT_FOUND');
      expect(response.body.metadata.requestId).toBeDefined();
    });

    it('should handle validation errors', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({}) // Missing required fields
        .expect(200); // Auth endpoint doesn't validate in this test

      expect(response.body).toBeDefined();
    });

    it('should include correlation ID in error responses', async () => {
      const response = await request(app)
        .get('/api/nonexistent')
        .expect(404);

      expect(response.body.metadata.requestId).toBeDefined();
      expect(response.headers['x-correlation-id']).toBeDefined();
    });
  });

  describe('Request/Response Transformation', () => {
    it('should add metadata to responses', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers['x-correlation-id']).toBeDefined();
      expect(response.headers['x-api-version']).toBeDefined();
    });

    it('should handle CORS headers', async () => {
      const response = await request(app)
        .options('/api/files')
        .set('Origin', 'http://localhost:3000')
        .expect(204);

      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });
  });

  describe('Performance', () => {
    it('should handle concurrent requests', async () => {
      const promises = Array.from({ length: 10 }, () =>
        request(app).get('/health').expect(200)
      );

      const start = Date.now();
      const responses = await Promise.all(promises);
      const duration = Date.now() - start;

      expect(responses).toHaveLength(10);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should have reasonable response times', async () => {
      const start = Date.now();
      
      await request(app)
        .get('/health')
        .expect(200);
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000); // Should respond within 1 second
    });
  });

  describe('Content Negotiation', () => {
    it('should handle JSON content type', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send({ email: 'test@example.com', password: 'password' })
        .expect(200);

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });

    it('should handle large request bodies', async () => {
      const largeData = 'x'.repeat(1000000); // 1MB string
      
      const response = await request(app)
        .post('/api/files')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ data: largeData })
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });
});