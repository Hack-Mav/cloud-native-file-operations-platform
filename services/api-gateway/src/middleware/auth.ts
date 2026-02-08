import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

interface User {
  id: string;
  email: string;
  roles: string[];
  tenantId?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

interface JWTPayload {
  sub: string;
  email: string;
  roles: string[];
  tenantId?: string;
  iat: number;
  exp: number;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  try {
    // Check for API key first
    const apiKey = req.headers['x-api-key'] as string;
    if (apiKey) {
      // Validate API key (this would typically involve a database lookup)
      if (validateApiKey(apiKey)) {
        // Set a service user context for API key requests
        req.user = {
          id: 'api-key-user',
          email: 'api@system.local',
          roles: ['api-user']
        };
        return next();
      } else {
        return res.status(401).json({
          error: {
            code: 'INVALID_API_KEY',
            message: 'Invalid API key provided',
            timestamp: new Date().toISOString(),
            requestId: req.correlationId
          }
        });
      }
    }

    // Check for JWT token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: {
          code: 'MISSING_TOKEN',
          message: 'Authorization token is required',
          timestamp: new Date().toISOString(),
          requestId: req.correlationId
        }
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    // Verify JWT token
    const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
    const decoded = jwt.verify(token, jwtSecret) as JWTPayload;
    
    // Extract user information from token
    req.user = {
      id: decoded.sub,
      email: decoded.email,
      roles: decoded.roles || [],
      tenantId: decoded.tenantId
    };

    // Check if token is expired (additional check)
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
      return res.status(401).json({
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'Authorization token has expired',
          timestamp: new Date().toISOString(),
          requestId: req.correlationId
        }
      });
    }

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid authorization token',
          timestamp: new Date().toISOString(),
          requestId: req.correlationId
        }
      });
    }

    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'Authorization token has expired',
          timestamp: new Date().toISOString(),
          requestId: req.correlationId
        }
      });
    }

    console.error('Authentication error:', error);
    return res.status(500).json({
      error: {
        code: 'AUTHENTICATION_ERROR',
        message: 'Internal authentication error',
        timestamp: new Date().toISOString(),
        requestId: req.correlationId
      }
    });
  }
}

// Role-based authorization middleware
export function requireRole(requiredRoles: string | string[]) {
  const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
  
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
          timestamp: new Date().toISOString(),
          requestId: req.correlationId
        }
      });
    }

    const hasRequiredRole = roles.some(role => req.user!.roles.includes(role));
    
    if (!hasRequiredRole) {
      return res.status(403).json({
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: `Required role(s): ${roles.join(', ')}`,
          timestamp: new Date().toISOString(),
          requestId: req.correlationId
        }
      });
    }

    next();
  };
}

// Tenant isolation middleware
export function requireTenant(req: Request, res: Response, next: NextFunction): void {
  if (!req.user?.tenantId) {
    return res.status(403).json({
      error: {
        code: 'TENANT_REQUIRED',
        message: 'Tenant context is required for this operation',
        timestamp: new Date().toISOString(),
        requestId: req.correlationId
      }
    });
  }

  // Add tenant ID to headers for downstream services
  req.headers['x-tenant-id'] = req.user.tenantId;
  
  next();
}

// Optional authentication middleware (doesn't fail if no token)
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(); // Continue without authentication
  }

  try {
    const token = authHeader.substring(7);
    const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
    const decoded = jwt.verify(token, jwtSecret) as JWTPayload;
    
    req.user = {
      id: decoded.sub,
      email: decoded.email,
      roles: decoded.roles || [],
      tenantId: decoded.tenantId
    };
  } catch (error) {
    // Ignore authentication errors for optional auth
    console.warn('Optional authentication failed:', error.message);
  }

  next();
}

// Simple API key validation (in production, this should check against a database)
function validateApiKey(apiKey: string): boolean {
  const validApiKeys = process.env.VALID_API_KEYS?.split(',') || [];
  return validApiKeys.includes(apiKey);
}

// Middleware to extract and validate service-to-service authentication
export function serviceAuth(req: Request, res: Response, next: NextFunction): void {
  const serviceToken = req.headers['x-service-token'] as string;
  
  if (!serviceToken) {
    return res.status(401).json({
      error: {
        code: 'SERVICE_TOKEN_REQUIRED',
        message: 'Service authentication token is required',
        timestamp: new Date().toISOString(),
        requestId: req.correlationId
      }
    });
  }

  // Validate service token (in production, use proper service mesh or mTLS)
  const validServiceToken = process.env.SERVICE_AUTH_TOKEN;
  if (serviceToken !== validServiceToken) {
    return res.status(401).json({
      error: {
        code: 'INVALID_SERVICE_TOKEN',
        message: 'Invalid service authentication token',
        timestamp: new Date().toISOString(),
        requestId: req.correlationId
      }
    });
  }

  next();
}