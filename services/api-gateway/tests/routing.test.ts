import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { routingConfig, getRouteConfig } from '../src/config/routing';

describe('Routing Configuration', () => {
  describe('getRouteConfig', () => {
    it('should return correct route config for auth endpoints', () => {
      const config = getRouteConfig('/api/auth/login');
      expect(config).toBeDefined();
      expect(config?.service).toBe('auth-service');
      expect(config?.requireAuth).toBe(false);
    });

    it('should return correct route config for file endpoints', () => {
      const config = getRouteConfig('/api/files/upload');
      expect(config).toBeDefined();
      expect(config?.service).toBe('file-service');
      expect(config?.requireAuth).toBe(true);
    });

    it('should return undefined for unknown routes', () => {
      const config = getRouteConfig('/api/unknown/endpoint');
      expect(config).toBeUndefined();
    });
  });

  describe('Route Configuration Validation', () => {
    it('should have valid route configurations', () => {
      routingConfig.forEach(route => {
        expect(route.path).toBeDefined();
        expect(route.service).toBeDefined();
        expect(typeof route.requireAuth).toBe('boolean');
        
        if (route.customRateLimit) {
          expect(route.customRateLimit.windowMs).toBeGreaterThan(0);
          expect(route.customRateLimit.max).toBeGreaterThan(0);
        }
      });
    });

    it('should have unique paths', () => {
      const paths = routingConfig.map(route => route.path);
      const uniquePaths = new Set(paths);
      expect(paths.length).toBe(uniquePaths.size);
    });

    it('should have auth service without auth requirement', () => {
      const authRoute = routingConfig.find(route => route.service === 'auth-service');
      expect(authRoute).toBeDefined();
      expect(authRoute?.requireAuth).toBe(false);
    });

    it('should have protected routes requiring authentication', () => {
      const protectedRoutes = routingConfig.filter(route => 
        route.service !== 'auth-service' && route.requireAuth
      );
      expect(protectedRoutes.length).toBeGreaterThan(0);
    });
  });
});

describe('API Gateway Routing Integration', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    
    // Mock middleware
    app.use((req, res, next) => {
      req.correlationId = 'test-id';
      req.apiVersion = 'v1';
      next();
    });

    // Add test routes based on routing config
    routingConfig.forEach(route => {
      app.use(route.path, (req, res) => {
        res.json({
          success: true,
          service: route.service,
          requireAuth: route.requireAuth,
          path: route.path
        });
      });
    });
  });

  it('should route auth requests correctly', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .expect(200);

    expect(response.body.service).toBe('auth-service');
    expect(response.body.requireAuth).toBe(false);
  });

  it('should route file requests correctly', async () => {
    const response = await request(app)
      .get('/api/files')
      .expect(200);

    expect(response.body.service).toBe('file-service');
    expect(response.body.requireAuth).toBe(true);
  });

  it('should route processing requests correctly', async () => {
    const response = await request(app)
      .post('/api/processing/jobs')
      .expect(200);

    expect(response.body.service).toBe('processing-service');
    expect(response.body.requireAuth).toBe(true);
  });

  it('should handle WebSocket upgrade requests', async () => {
    const response = await request(app)
      .get('/ws/notifications')
      .expect(200);

    expect(response.body.service).toBe('notification-service');
    expect(response.body.requireAuth).toBe(true);
  });
});