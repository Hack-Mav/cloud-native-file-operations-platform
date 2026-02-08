import { Request, Response, NextFunction } from 'express';
import { jwtService } from '../services/jwtService';
import { AuthService } from '../services/authService';
import { createError } from './errors';
import { USER_ROLES } from '../models/User';

// Extend Request interface to include user data
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        email: string;
        roles: string[];
      };
    }
  }
}

export class AuthMiddleware {
  private authService: AuthService;

  constructor() {
    this.authService = new AuthService();
  }

  /**
   * Middleware to authenticate JWT tokens
   */
  authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw createError('Access token required', 401, 'MISSING_TOKEN');
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix
      
      // Verify token
      const payload = jwtService.verifyToken(token);
      
      if (payload.type !== 'access') {
        throw createError('Invalid token type', 401, 'INVALID_TOKEN_TYPE');
      }

      // Get user from database to ensure they still exist and are active
      const user = await this.authService.getUserById(payload.userId);
      
      if (!user) {
        throw createError('User not found', 401, 'USER_NOT_FOUND');
      }

      if (user.status !== 'active') {
        throw createError('User account is not active', 401, 'ACCOUNT_INACTIVE');
      }

      // Add user info to request
      req.user = {
        userId: payload.userId,
        email: payload.email,
        roles: payload.roles
      };

      next();
    } catch (error) {
      next(error);
    }
  };

  /**
   * Middleware to check if user has required role(s)
   */
  requireRole = (requiredRoles: string | string[]) => {
    return (req: Request, res: Response, next: NextFunction): void => {
      try {
        if (!req.user) {
          throw createError('Authentication required', 401, 'AUTHENTICATION_REQUIRED');
        }

        const userRoles = req.user.roles;
        const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];

        // Check if user has any of the required roles
        const hasRequiredRole = roles.some(role => userRoles.includes(role));

        if (!hasRequiredRole) {
          throw createError('Insufficient permissions', 403, 'INSUFFICIENT_PERMISSIONS');
        }

        next();
      } catch (error) {
        next(error);
      }
    };
  };

  /**
   * Middleware to check if user is admin
   */
  requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
    this.requireRole(USER_ROLES.ADMIN)(req, res, next);
  };

  /**
   * Middleware to check if user can access their own resources or is admin
   */
  requireOwnershipOrAdmin = (userIdParam: string = 'userId') => {
    return (req: Request, res: Response, next: NextFunction): void => {
      try {
        if (!req.user) {
          throw createError('Authentication required', 401, 'AUTHENTICATION_REQUIRED');
        }

        const targetUserId = req.params[userIdParam];
        const currentUserId = req.user.userId;
        const isAdmin = req.user.roles.includes(USER_ROLES.ADMIN);

        // Allow if user is accessing their own resources or is admin
        if (targetUserId === currentUserId || isAdmin) {
          next();
        } else {
          throw createError('Access denied', 403, 'ACCESS_DENIED');
        }
      } catch (error) {
        next(error);
      }
    };
  };

  /**
   * Optional authentication - adds user info if token is present but doesn't require it
   */
  optionalAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        
        try {
          const payload = jwtService.verifyToken(token);
          
          if (payload.type === 'access') {
            const user = await this.authService.getUserById(payload.userId);
            
            if (user && user.status === 'active') {
              req.user = {
                userId: payload.userId,
                email: payload.email,
                roles: payload.roles
              };
            }
          }
        } catch (error) {
          // Ignore token errors for optional auth
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

// Export singleton instance
export const authMiddleware = new AuthMiddleware();

// Export individual middleware functions for convenience
export const authenticate = authMiddleware.authenticate;
export const requireRole = authMiddleware.requireRole;
export const requireAdmin = authMiddleware.requireAdmin;
export const requireOwnershipOrAdmin = authMiddleware.requireOwnershipOrAdmin;
export const optionalAuth = authMiddleware.optionalAuth;