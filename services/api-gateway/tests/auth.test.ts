import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { authMiddleware, requireRole, optionalAuth } from '../src/middleware/auth';
import { mockRequest, mockResponse, mockNext } from './setup';

describe('Authentication Middleware', () => {
  const validToken = jwt.sign(
    {
      sub: 'user123',
      email: 'test@example.com',
      roles: ['user', 'admin'],
      tenantId: 'tenant123'
    },
    'test-secret-key',
    { expiresIn: '1h' }
  );

  const expiredToken = jwt.sign(
    {
      sub: 'user456',
      email: 'expired@example.com',
      roles: ['user']
    },
    'test-secret-key',
    { expiresIn: '-1h' } // Expired
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('JWT Token Authentication', () => {
    it('should authenticate valid JWT token', () => {
      const req = mockRequest({
        headers: {
          authorization: `Bearer ${validToken}`
        }
      });
      const res = mockResponse();
      const next = mockNext;

      authMiddleware(req, res, next);

      expect(req.user).toBeDefined();
      expect(req.user.id).toBe('user123');
      expect(req.user.email).toBe('test@example.com');
      expect(req.user.roles).toEqual(['user', 'admin']);
      expect(req.user.tenantId).toBe('tenant123');
      expect(next).toHaveBeenCalled();
    });

    it('should reject missing authorization header', () => {
      const req = mockRequest({
        correlationId: 'test-correlation-id'
      });
      const res = mockResponse();
      const next = mockNext;

      authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'MISSING_TOKEN'
          })
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject malformed authorization header', () => {
      const req = mockRequest({
        headers: {
          authorization: 'InvalidFormat token'
        },
        correlationId: 'test-correlation-id'
      });
      const res = mockResponse();
      const next = mockNext;

      authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'MISSING_TOKEN'
          })
        })
      );
    });

    it('should reject invalid JWT token', () => {
      const req = mockRequest({
        headers: {
          authorization: 'Bearer invalid.jwt.token'
        },
        correlationId: 'test-correlation-id'
      });
      const res = mockResponse();
      const next = mockNext;

      authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'INVALID_TOKEN'
          })
        })
      );
    });

    it('should reject expired JWT token', () => {
      const req = mockRequest({
        headers: {
          authorization: `Bearer ${expiredToken}`
        },
        correlationId: 'test-correlation-id'
      });
      const res = mockResponse();
      const next = mockNext;

      authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'TOKEN_EXPIRED'
          })
        })
      );
    });
  });

  describe('API Key Authentication', () => {
    it('should authenticate valid API key', () => {
      const req = mockRequest({
        headers: {
          'x-api-key': 'test-api-key-1'
        }
      });
      const res = mockResponse();
      const next = mockNext;

      authMiddleware(req, res, next);

      expect(req.user).toBeDefined();
      expect(req.user.id).toBe('api-key-user');
      expect(req.user.roles).toEqual(['api-user']);
      expect(next).toHaveBeenCalled();
    });

    it('should reject invalid API key', () => {
      const req = mockRequest({
        headers: {
          'x-api-key': 'invalid-api-key'
        },
        correlationId: 'test-correlation-id'
      });
      const res = mockResponse();
      const next = mockNext;

      authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'INVALID_API_KEY'
          })
        })
      );
    });
  });

  describe('Role-based Authorization', () => {
    it('should allow access with required role', () => {
      const req = mockRequest({
        user: {
          id: 'user123',
          email: 'test@example.com',
          roles: ['user', 'admin']
        }
      });
      const res = mockResponse();
      const next = mockNext;

      const middleware = requireRole('admin');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should allow access with any of multiple required roles', () => {
      const req = mockRequest({
        user: {
          id: 'user123',
          email: 'test@example.com',
          roles: ['user']
        }
      });
      const res = mockResponse();
      const next = mockNext;

      const middleware = requireRole(['admin', 'user']);
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should deny access without required role', () => {
      const req = mockRequest({
        user: {
          id: 'user123',
          email: 'test@example.com',
          roles: ['user']
        },
        correlationId: 'test-correlation-id'
      });
      const res = mockResponse();
      const next = mockNext;

      const middleware = requireRole('admin');
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'INSUFFICIENT_PERMISSIONS'
          })
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should deny access without authentication', () => {
      const req = mockRequest({
        correlationId: 'test-correlation-id'
      });
      const res = mockResponse();
      const next = mockNext;

      const middleware = requireRole('user');
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'UNAUTHORIZED'
          })
        })
      );
    });
  });

  describe('Optional Authentication', () => {
    it('should continue without authentication when no token provided', () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext;

      optionalAuth(req, res, next);

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });

    it('should authenticate when valid token provided', () => {
      const req = mockRequest({
        headers: {
          authorization: `Bearer ${validToken}`
        }
      });
      const res = mockResponse();
      const next = mockNext;

      optionalAuth(req, res, next);

      expect(req.user).toBeDefined();
      expect(req.user.id).toBe('user123');
      expect(next).toHaveBeenCalled();
    });

    it('should continue when invalid token provided', () => {
      const req = mockRequest({
        headers: {
          authorization: 'Bearer invalid.token'
        }
      });
      const res = mockResponse();
      const next = mockNext;

      optionalAuth(req, res, next);

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle JWT verification errors gracefully', () => {
      // Mock JWT verify to throw an error
      const originalVerify = jwt.verify;
      jwt.verify = jest.fn().mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const req = mockRequest({
        headers: {
          authorization: `Bearer ${validToken}`
        },
        correlationId: 'test-correlation-id'
      });
      const res = mockResponse();
      const next = mockNext;

      authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'AUTHENTICATION_ERROR'
          })
        })
      );

      // Restore original function
      jwt.verify = originalVerify;
    });
  });
});