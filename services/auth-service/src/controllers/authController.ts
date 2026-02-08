import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/authService';
import { createError } from '../middleware/errors';
import { CreateUserRequest, LoginRequest, RefreshTokenRequest } from '../models/User';

export class AuthController {
  private authService: AuthService;

  constructor() {
    this.authService = new AuthService();
  }

  register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userData: CreateUserRequest = req.body;
      const result = await this.authService.register(userData);
      
      res.status(201).json({
        message: 'User registered successfully',
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          roles: result.user.roles,
          status: result.user.status
        },
        tokens: result.tokens
      });
    } catch (error) {
      next(error);
    }
  };

  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const loginData: LoginRequest = req.body;
      const result = await this.authService.login(loginData);
      
      res.status(200).json({
        message: 'Login successful',
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          roles: result.user.roles,
          lastLoginAt: result.user.lastLoginAt
        },
        tokens: result.tokens,
        mfaRequired: result.mfaRequired
      });
    } catch (error) {
      next(error);
    }
  };

  refreshToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { refreshToken }: RefreshTokenRequest = req.body;
      const result = await this.authService.refreshToken(refreshToken);
      
      res.status(200).json({
        message: 'Token refreshed successfully',
        tokens: result
      });
    } catch (error) {
      next(error);
    }
  };

  getProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user.userId;
      const user = await this.authService.getUserById(userId);
      
      if (!user) {
        throw createError('User not found', 404, 'USER_NOT_FOUND');
      }

      res.status(200).json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          roles: user.roles,
          preferences: user.preferences,
          mfa: {
            enabled: user.mfa.enabled
          },
          createdAt: user.createdAt,
          lastLoginAt: user.lastLoginAt,
          status: user.status,
          emailVerified: user.emailVerified
        }
      });
    } catch (error) {
      next(error);
    }
  };

  updateProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user.userId;
      const updates = req.body;
      
      const updatedUser = await this.authService.updateUser(userId, updates);
      
      res.status(200).json({
        message: 'Profile updated successfully',
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          name: updatedUser.name,
          preferences: updatedUser.preferences
        }
      });
    } catch (error) {
      next(error);
    }
  };

  logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // In a real implementation, you might want to blacklist the token
      // For now, we'll just return a success message
      res.status(200).json({
        message: 'Logout successful'
      });
    } catch (error) {
      next(error);
    }
  };

  setupMFA = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user.userId;
      const mfaSetup = await this.authService.setupMFA(userId);
      
      res.status(200).json({
        message: 'MFA setup initiated',
        ...mfaSetup
      });
    } catch (error) {
      next(error);
    }
  };

  verifyMFA = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user.userId;
      const { code } = req.body;
      
      const result = await this.authService.verifyMFA(userId, code);
      
      res.status(200).json({
        message: 'MFA verified successfully',
        verified: result
      });
    } catch (error) {
      next(error);
    }
  };

  disableMFA = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user.userId;
      const { password } = req.body;
      
      await this.authService.disableMFA(userId, password);
      
      res.status(200).json({
        message: 'MFA disabled successfully'
      });
    } catch (error) {
      next(error);
    }
  };

  // User Management Endpoints

  changePassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user.userId;
      const { currentPassword, newPassword } = req.body;
      
      await this.authService.changePassword(userId, currentPassword, newPassword);
      
      res.status(200).json({
        message: 'Password changed successfully'
      });
    } catch (error) {
      next(error);
    }
  };

  getAllUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { page, limit, sortBy, sortOrder } = req.query as any;
      const result = await this.authService.getAllUsers({ page, limit, sortBy, sortOrder });
      
      res.status(200).json({
        message: 'Users retrieved successfully',
        ...result
      });
    } catch (error) {
      next(error);
    }
  };

  getUserById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = req.params;
      const user = await this.authService.getUserById(userId);
      
      if (!user) {
        throw createError('User not found', 404, 'USER_NOT_FOUND');
      }

      res.status(200).json({
        message: 'User retrieved successfully',
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          roles: user.roles,
          preferences: user.preferences,
          mfa: {
            enabled: user.mfa.enabled
          },
          createdAt: user.createdAt,
          lastLoginAt: user.lastLoginAt,
          status: user.status,
          emailVerified: user.emailVerified
        }
      });
    } catch (error) {
      next(error);
    }
  };

  updateUserRoles = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = req.params;
      const { roles } = req.body;
      
      const updatedUser = await this.authService.updateUserRoles(userId, roles);
      
      res.status(200).json({
        message: 'User roles updated successfully',
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          name: updatedUser.name,
          roles: updatedUser.roles
        }
      });
    } catch (error) {
      next(error);
    }
  };

  updateUserStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = req.params;
      const { status } = req.body;
      
      const updatedUser = await this.authService.updateUserStatus(userId, status);
      
      res.status(200).json({
        message: 'User status updated successfully',
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          name: updatedUser.name,
          status: updatedUser.status
        }
      });
    } catch (error) {
      next(error);
    }
  };

  deleteUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = req.params;
      
      await this.authService.deleteUser(userId);
      
      res.status(200).json({
        message: 'User deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  };

  searchUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { q: searchTerm } = req.query as { q: string };
      const { page, limit, sortBy, sortOrder } = req.query as any;
      
      if (!searchTerm) {
        throw createError('Search term is required', 400, 'MISSING_SEARCH_TERM');
      }

      const result = await this.authService.searchUsers(searchTerm, { page, limit, sortBy, sortOrder });
      
      res.status(200).json({
        message: 'Users search completed',
        ...result
      });
    } catch (error) {
      next(error);
    }
  };

  getUsersByRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { role } = req.params;
      const { page, limit, sortBy, sortOrder } = req.query as any;
      
      const result = await this.authService.getUsersByRole(role, { page, limit, sortBy, sortOrder });
      
      res.status(200).json({
        message: 'Users retrieved by role successfully',
        ...result
      });
    } catch (error) {
      next(error);
    }
  };

  getUserStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const stats = await this.authService.getUserStats();
      
      res.status(200).json({
        message: 'User statistics retrieved successfully',
        stats
      });
    } catch (error) {
      next(error);
    }
  };

  // OAuth endpoints

  getOAuthProviders = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const providers = await this.authService.getAvailableOAuthProviders();
      
      res.status(200).json({
        message: 'OAuth providers retrieved successfully',
        providers
      });
    } catch (error) {
      next(error);
    }
  };

  getOAuthAuthUrl = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { provider } = req.params;
      const { state } = req.query as { state?: string };
      
      const authUrl = await this.authService.getOAuthAuthorizationUrl(provider, state);
      
      res.status(200).json({
        message: 'OAuth authorization URL generated',
        authUrl
      });
    } catch (error) {
      next(error);
    }
  };

  oauthCallback = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { provider } = req.params;
      const { code, state } = req.query as { code: string; state?: string };
      
      if (!code) {
        throw createError('Authorization code is required', 400, 'MISSING_AUTH_CODE');
      }

      const result = await this.authService.oauthLogin(provider, code);
      
      res.status(200).json({
        message: result.isNewUser ? 'User registered and logged in successfully' : 'Login successful',
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          roles: result.user.roles,
          lastLoginAt: result.user.lastLoginAt
        },
        tokens: result.tokens,
        isNewUser: result.isNewUser
      });
    } catch (error) {
      next(error);
    }
  };

  // MFA Policy endpoints

  enforceMFA = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = req.params;
      const { enforced = true } = req.body;
      
      const updatedUser = await this.authService.enforceMFAForUser(userId, enforced);
      
      res.status(200).json({
        message: `MFA ${enforced ? 'enforced' : 'unenforced'} for user successfully`,
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          name: updatedUser.name,
          mfa: {
            enabled: updatedUser.mfa.enabled,
            enforced: updatedUser.mfa.enforced
          }
        }
      });
    } catch (error) {
      next(error);
    }
  };

  checkMFAStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user.userId;
      const gracePeriodInfo = await this.authService.checkMFAGracePeriod(userId);
      
      res.status(200).json({
        message: 'MFA status retrieved successfully',
        ...gracePeriodInfo
      });
    } catch (error) {
      next(error);
    }
  };

  generateRecoveryCodes = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user.userId;
      const recoveryCodes = await this.authService.generateMFARecoveryCodes(userId);
      
      res.status(200).json({
        message: 'MFA recovery codes generated successfully',
        recoveryCodes
      });
    } catch (error) {
      next(error);
    }
  };
}