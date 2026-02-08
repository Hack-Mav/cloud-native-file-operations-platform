import request from 'supertest';
import express from 'express';
import { AuthController } from '../src/controllers/authController';
import { AuthService } from '../src/services/authService';
import { USER_ROLES } from '../src/models/User';

// Mock the AuthService
jest.mock('../src/services/authService');

describe('AuthController Integration Tests', () => {
  let app: express.Application;
  let authController: AuthController;
  let mockAuthService: jest.Mocked<AuthService>;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    authController = new AuthController();
    mockAuthService = new AuthService() as jest.Mocked<AuthService>;
    (authController as any).authService = mockAuthService;

    // Setup routes
    app.post('/auth/register', authController.register);
    app.post('/auth/login', authController.login);
    app.post('/auth/refresh', authController.refreshToken);
    app.get('/auth/profile', (req, res, next) => {
      // Mock authentication middleware
      (req as any).user = { userId: 'test-user-id' };
      next();
    }, authController.getProfile);
    app.put('/auth/profile', (req, res, next) => {
      (req as any).user = { userId: 'test-user-id' };
      next();
    }, authController.updateProfile);
    app.post('/auth/logout', authController.logout);
    app.post('/auth/mfa/setup', (req, res, next) => {
      (req as any).user = { userId: 'test-user-id' };
      next();
    }, authController.setupMFA);
    app.post('/auth/mfa/verify', (req, res, next) => {
      (req as any).user = { userId: 'test-user-id' };
      next();
    }, authController.verifyMFA);
    app.post('/auth/mfa/disable', (req, res, next) => {
      (req as any).user = { userId: 'test-user-id' };
      next();
    }, authController.disableMFA);
    app.post('/auth/change-password', (req, res, next) => {
      (req as any).user = { userId: 'test-user-id' };
      next();
    }, authController.changePassword);
    app.get('/auth/users', authController.getAllUsers);
    app.get('/auth/users/:userId', authController.getUserById);
    app.put('/auth/users/:userId/roles', authController.updateUserRoles);
    app.put('/auth/users/:userId/status', authController.updateUserStatus);
    app.delete('/auth/users/:userId', authController.deleteUser);
    app.get('/auth/search', authController.searchUsers);
    app.get('/auth/users/role/:role', authController.getUsersByRole);
    app.get('/auth/stats', authController.getUserStats);
    app.get('/auth/oauth/providers', authController.getOAuthProviders);
    app.get('/auth/oauth/:provider/url', authController.getOAuthAuthUrl);
    app.post('/auth/oauth/:provider/callback', authController.oauthCallback);

    jest.clearAllMocks();
  });

  describe('POST /auth/register', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'password123',
        roles: [USER_ROLES.USER]
      };

      const mockResult = {
        user: {
          id: 'test-user-id',
          email: 'test@example.com',
          name: 'Test User',
          passwordHash: 'hashed-password',
          roles: [USER_ROLES.USER],
          preferences: {
            notifications: { email: true, push: true, sms: false },
            ui: { theme: 'light', language: 'en' }
          },
          mfa: { enabled: false, enforced: false },
          createdAt: new Date(),
          status: 'active' as const,
          emailVerified: true,
          loginAttempts: 0
        },
        tokens: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresIn: 3600
        }
      };

      mockAuthService.register.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body.message).toBe('User registered successfully');
      expect(response.body.user.email).toBe(userData.email);
      expect(response.body.tokens.accessToken).toBe('access-token');
    });

    it('should return 409 when user already exists', async () => {
      const userData = {
        email: 'existing@example.com',
        name: 'Existing User',
        password: 'password123'
      };

      const error = new Error('User already exists');
      (error as any).statusCode = 409;
      (error as any).code = 'USER_EXISTS';
      mockAuthService.register.mockRejectedValue(error);

      await request(app)
        .post('/auth/register')
        .send(userData)
        .expect(409);
    });
  });

  describe('POST /auth/login', () => {
    it('should login user successfully', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'password123'
      };

      const mockResult = {
        user: {
          id: 'test-user-id',
          email: 'test@example.com',
          name: 'Test User',
          passwordHash: 'hashed-password',
          roles: [USER_ROLES.USER],
          preferences: {
            notifications: { email: true, push: true, sms: false },
            ui: { theme: 'light', language: 'en' }
          },
          mfa: { enabled: false, enforced: false },
          createdAt: new Date(),
          lastLoginAt: new Date(),
          status: 'active' as const,
          emailVerified: true,
          loginAttempts: 0
        },
        tokens: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresIn: 3600
        },
        mfaRequired: false
      };

      mockAuthService.login.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/auth/login')
        .send(loginData)
        .expect(200);

      expect(response.body.message).toBe('Login successful');
      expect(response.body.user.email).toBe(loginData.email);
      expect(response.body.mfaRequired).toBe(false);
    });

    it('should require MFA when enabled', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'password123'
      };

      const mockResult = {
        user: {
          id: 'test-user-id',
          email: 'test@example.com',
          name: 'Test User',
          passwordHash: 'hashed-password',
          roles: [USER_ROLES.USER],
          preferences: {
            notifications: { email: true, push: true, sms: false },
            ui: { theme: 'light', language: 'en' }
          },
          mfa: { enabled: true, enforced: false },
          createdAt: new Date(),
          lastLoginAt: new Date(),
          status: 'active' as const,
          emailVerified: true,
          loginAttempts: 0
        },
        tokens: {
          accessToken: '',
          refreshToken: '',
          expiresIn: 0
        },
        mfaRequired: true
      };

      mockAuthService.login.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/auth/login')
        .send(loginData)
        .expect(200);

      expect(response.body.mfaRequired).toBe(true);
      expect(response.body.tokens.accessToken).toBe('');
    });

    it('should return 401 for invalid credentials', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'wrongpassword'
      };

      const error = new Error('Invalid credentials');
      (error as any).statusCode = 401;
      (error as any).code = 'INVALID_CREDENTIALS';
      mockAuthService.login.mockRejectedValue(error);

      await request(app)
        .post('/auth/login')
        .send(loginData)
        .expect(401);
    });
  });

  describe('POST /auth/refresh', () => {
    it('should refresh token successfully', async () => {
      const refreshData = {
        refreshToken: 'valid-refresh-token'
      };

      const mockResult = {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresIn: 3600
      };

      mockAuthService.refreshToken.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/auth/refresh')
        .send(refreshData)
        .expect(200);

      expect(response.body.message).toBe('Token refreshed successfully');
      expect(response.body.tokens.accessToken).toBe('new-access-token');
    });

    it('should return 401 for invalid refresh token', async () => {
      const refreshData = {
        refreshToken: 'invalid-refresh-token'
      };

      const error = new Error('Invalid refresh token');
      (error as any).statusCode = 401;
      (error as any).code = 'INVALID_REFRESH_TOKEN';
      mockAuthService.refreshToken.mockRejectedValue(error);

      await request(app)
        .post('/auth/refresh')
        .send(refreshData)
        .expect(401);
    });
  });

  describe('GET /auth/profile', () => {
    it('should get user profile successfully', async () => {
      const mockUser = {
        id: 'test-user-id',
        email: 'test@example.com',
        name: 'Test User',
        passwordHash: 'hashed-password',
        roles: [USER_ROLES.USER],
        preferences: {
          notifications: { email: true, push: true, sms: false },
          ui: { theme: 'light', language: 'en' }
        },
        mfa: { enabled: false, enforced: false },
        createdAt: new Date(),
        lastLoginAt: new Date(),
        status: 'active' as const,
        emailVerified: true,
        loginAttempts: 0
      };

      mockAuthService.getUserById.mockResolvedValue(mockUser as any);

      const response = await request(app)
        .get('/auth/profile')
        .expect(200);

      expect(response.body.user.email).toBe(mockUser.email);
      expect(response.body.user.name).toBe(mockUser.name);
    });

    it('should return 404 when user not found', async () => {
      mockAuthService.getUserById.mockResolvedValue(null);

      await request(app)
        .get('/auth/profile')
        .expect(404);
    });
  });

  describe('PUT /auth/profile', () => {
    it('should update user profile successfully', async () => {
      const updates = {
        name: 'Updated Name',
        preferences: {
          notifications: { email: false, push: true, sms: false },
          ui: { theme: 'dark', language: 'en' }
        }
      };

      const mockUpdatedUser = {
        id: 'test-user-id',
        email: 'test@example.com',
        name: 'Updated Name',
        preferences: updates.preferences
      };

      mockAuthService.updateUser.mockResolvedValue(mockUpdatedUser as any);

      const response = await request(app)
        .put('/auth/profile')
        .send(updates)
        .expect(200);

      expect(response.body.message).toBe('Profile updated successfully');
      expect(response.body.user.name).toBe('Updated Name');
    });
  });

  describe('POST /auth/mfa/setup', () => {
    it('should setup MFA successfully', async () => {
      const mockMFASetup = {
        secret: 'test-secret',
        qrCode: 'data:image/png;base64,test-qr-code',
        backupCodes: ['CODE1', 'CODE2', 'CODE3']
      };

      mockAuthService.setupMFA.mockResolvedValue(mockMFASetup);

      const response = await request(app)
        .post('/auth/mfa/setup')
        .expect(200);

      expect(response.body.message).toBe('MFA setup initiated');
      expect(response.body.secret).toBe('test-secret');
      expect(response.body.backupCodes).toHaveLength(3);
    });
  });

  describe('POST /auth/mfa/verify', () => {
    it('should verify MFA code successfully', async () => {
      const verifyData = { code: '123456' };

      mockAuthService.verifyMFA.mockResolvedValue(true);

      const response = await request(app)
        .post('/auth/mfa/verify')
        .send(verifyData)
        .expect(200);

      expect(response.body.message).toBe('MFA verified successfully');
      expect(response.body.verified).toBe(true);
    });

    it('should reject invalid MFA code', async () => {
      const verifyData = { code: 'invalid' };

      mockAuthService.verifyMFA.mockResolvedValue(false);

      const response = await request(app)
        .post('/auth/mfa/verify')
        .send(verifyData)
        .expect(200);

      expect(response.body.verified).toBe(false);
    });
  });

  describe('POST /auth/change-password', () => {
    it('should change password successfully', async () => {
      const passwordData = {
        currentPassword: 'oldpassword',
        newPassword: 'newpassword123'
      };

      mockAuthService.changePassword.mockResolvedValue(undefined);

      const response = await request(app)
        .post('/auth/change-password')
        .send(passwordData)
        .expect(200);

      expect(response.body.message).toBe('Password changed successfully');
    });

    it('should reject incorrect current password', async () => {
      const passwordData = {
        currentPassword: 'wrongpassword',
        newPassword: 'newpassword123'
      };

      const error = new Error('Current password is incorrect');
      (error as any).statusCode = 400;
      (error as any).code = 'INVALID_CURRENT_PASSWORD';
      mockAuthService.changePassword.mockRejectedValue(error);

      await request(app)
        .post('/auth/change-password')
        .send(passwordData)
        .expect(400);
    });
  });

  describe('GET /auth/users', () => {
    it('should get all users with pagination', async () => {
      const mockResult = {
        data: [
          { id: 'user1', email: 'user1@example.com', name: 'User 1' },
          { id: 'user2', email: 'user2@example.com', name: 'User 2' }
        ],
        pagination: {
          page: 1,
          limit: 20,
          total: 2,
          totalPages: 1,
          hasNext: false,
          hasPrev: false
        }
      };

      mockAuthService.getAllUsers.mockResolvedValue(mockResult);

      const response = await request(app)
        .get('/auth/users')
        .expect(200);

      expect(response.body.message).toBe('Users retrieved successfully');
      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination.total).toBe(2);
    });
  });

  describe('GET /auth/users/:userId', () => {
    it('should get user by ID successfully', async () => {
      const mockUser = {
        id: 'test-user-id',
        email: 'test@example.com',
        name: 'Test User',
        passwordHash: 'hashed-password',
        roles: [USER_ROLES.USER],
        preferences: {
          notifications: { email: true, push: true, sms: false },
          ui: { theme: 'light', language: 'en' }
        },
        mfa: { enabled: false, enforced: false },
        createdAt: new Date(),
        status: 'active' as const,
        emailVerified: true,
        loginAttempts: 0
      };

      mockAuthService.getUserById.mockResolvedValue(mockUser as any);

      const response = await request(app)
        .get('/auth/users/test-user-id')
        .expect(200);

      expect(response.body.message).toBe('User retrieved successfully');
      expect(response.body.user.id).toBe('test-user-id');
    });
  });

  describe('PUT /auth/users/:userId/roles', () => {
    it('should update user roles successfully', async () => {
      const rolesData = { roles: [USER_ROLES.ADMIN] };
      const mockUpdatedUser = {
        id: 'test-user-id',
        email: 'test@example.com',
        name: 'Test User',
        roles: [USER_ROLES.ADMIN]
      };

      mockAuthService.updateUserRoles.mockResolvedValue(mockUpdatedUser as any);

      const response = await request(app)
        .put('/auth/users/test-user-id/roles')
        .send(rolesData)
        .expect(200);

      expect(response.body.message).toBe('User roles updated successfully');
      expect(response.body.user.roles).toContain(USER_ROLES.ADMIN);
    });
  });

  describe('GET /auth/stats', () => {
    it('should get user statistics successfully', async () => {
      const mockStats = {
        total: 100,
        active: 80,
        inactive: 15,
        suspended: 3,
        pending: 2,
        byRole: {
          [USER_ROLES.USER]: 85,
          [USER_ROLES.ADMIN]: 15
        }
      };

      mockAuthService.getUserStats.mockResolvedValue(mockStats);

      const response = await request(app)
        .get('/auth/stats')
        .expect(200);

      expect(response.body.message).toBe('User statistics retrieved successfully');
      expect(response.body.stats.total).toBe(100);
      expect(response.body.stats.active).toBe(80);
    });
  });

  describe('OAuth Endpoints', () => {
    it('should get OAuth providers successfully', async () => {
      const mockProviders = [
        { id: 'google', name: 'Google' },
        { id: 'microsoft', name: 'Microsoft' }
      ];

      (mockAuthService.getAvailableOAuthProviders as jest.Mock).mockResolvedValue(mockProviders);

      const response = await request(app)
        .get('/auth/oauth/providers')
        .expect(200);

      expect(response.body.message).toBe('OAuth providers retrieved successfully');
      expect(response.body.providers).toHaveLength(2);
    });

    it('should get OAuth authorization URL successfully', async () => {
      const mockAuthUrl = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=test';

      (mockAuthService.getOAuthAuthorizationUrl as jest.Mock).mockResolvedValue(mockAuthUrl);

      const response = await request(app)
        .get('/auth/oauth/google/url?state=test-state')
        .expect(200);

      expect(response.body.message).toBe('OAuth authorization URL generated');
      expect(response.body.authUrl).toBe(mockAuthUrl);
    });

    it('should handle OAuth callback successfully', async () => {
      const mockResult = {
        user: {
          id: 'test-user-id',
          email: 'test@example.com',
          name: 'Test User',
          passwordHash: 'hashed-password',
          roles: [USER_ROLES.USER],
          preferences: {
            notifications: { email: true, push: true, sms: false },
            ui: { theme: 'light', language: 'en' }
          },
          mfa: { enabled: false, enforced: false },
          createdAt: new Date(),
          lastLoginAt: new Date(),
          status: 'active' as const,
          emailVerified: true,
          loginAttempts: 0
        },
        tokens: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresIn: 3600
        },
        isNewUser: false
      };

      mockAuthService.oauthLogin.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/auth/oauth/google/callback?code=auth-code&state=test-state')
        .expect(200);

      expect(response.body.message).toBe('Login successful');
      expect(response.body.user.email).toBe('test@example.com');
      expect(response.body.isNewUser).toBe(false);
    });
  });
});