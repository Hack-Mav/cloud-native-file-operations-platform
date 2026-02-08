import { AuthService } from '../src/services/authService';
import { User, USER_ROLES, CreateUserRequest, LoginRequest } from '../src/models/User';
import * as bcrypt from 'bcryptjs';

// Mock dependencies
jest.mock('../src/database/datastore');
jest.mock('../src/services/jwtService');
jest.mock('../src/services/oauthService');

describe('AuthService Unit Tests', () => {
  let authService: AuthService;
  let mockUser: User;

  beforeEach(() => {
    authService = new AuthService();
    mockUser = {
      id: 'test-user-id',
      email: 'test@example.com',
      name: 'Test User',
      passwordHash: 'hashed-password',
      roles: [USER_ROLES.USER],
      preferences: {
        notifications: { email: true, push: true, sms: false },
        ui: { theme: 'light', language: 'en' }
      },
      mfa: {
        enabled: false,
        enforced: false
      },
      createdAt: new Date(),
      status: 'active',
      emailVerified: true,
      loginAttempts: 0
    };
    jest.clearAllMocks();
  });

  describe('User Registration', () => {
    it('should register a new user successfully', async () => {
      const userData: CreateUserRequest = {
        email: 'newuser@example.com',
        name: 'New User',
        password: 'password123',
        roles: [USER_ROLES.USER]
      };

      jest.spyOn(authService, 'getUserByEmail').mockResolvedValue(null);
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed-password' as never);
      
      // Mock datastore operations
      const mockDatastore = require('../src/database/datastore');
      mockDatastore.datastoreClient.createKey.mockReturnValue({ id: 'new-user-id' });
      mockDatastore.datastoreClient.save.mockResolvedValue(undefined);

      // Mock JWT service
      const mockJwtService = require('../src/services/jwtService');
      mockJwtService.jwtService.generateTokens.mockReturnValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 3600
      });

      const result = await authService.register(userData);

      expect(result.user.email).toBe(userData.email.toLowerCase());
      expect(result.user.name).toBe(userData.name);
      expect(result.tokens.accessToken).toBe('access-token');
      expect(bcrypt.hash).toHaveBeenCalledWith(userData.password, expect.any(Number));
    });

    it('should throw error if user already exists', async () => {
      const userData: CreateUserRequest = {
        email: 'existing@example.com',
        name: 'Existing User',
        password: 'password123'
      };

      jest.spyOn(authService, 'getUserByEmail').mockResolvedValue(mockUser);

      await expect(authService.register(userData)).rejects.toThrow('User already exists');
    });

    it('should enforce MFA for admin users', async () => {
      const adminUserData: CreateUserRequest = {
        email: 'admin@example.com',
        name: 'Admin User',
        password: 'password123',
        roles: [USER_ROLES.ADMIN]
      };

      jest.spyOn(authService, 'getUserByEmail').mockResolvedValue(null);
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed-password' as never);
      
      const mockDatastore = require('../src/database/datastore');
      mockDatastore.datastoreClient.createKey.mockReturnValue({ id: 'admin-user-id' });
      mockDatastore.datastoreClient.save.mockResolvedValue(undefined);

      const mockJwtService = require('../src/services/jwtService');
      mockJwtService.jwtService.generateTokens.mockReturnValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 3600
      });

      // Mock config to enforce MFA for admins
      const mockConfig = require('../src/config/config');
      mockConfig.config = {
        ...mockConfig.config,
        mfaPolicy: {
          enforceForAllUsers: false,
          enforceForAdmins: true,
          gracePeriodDays: 7
        }
      };

      const result = await authService.register(adminUserData);
      expect(result.user.mfa.enforced).toBe(true);
    });
  });

  describe('User Login', () => {
    it('should login user with valid credentials', async () => {
      const loginData: LoginRequest = {
        email: 'test@example.com',
        password: 'password123'
      };

      jest.spyOn(authService, 'getUserByEmail').mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
      jest.spyOn(authService as any, 'handleSuccessfulLogin').mockResolvedValue(undefined);

      const mockJwtService = require('../src/services/jwtService');
      mockJwtService.jwtService.generateTokens.mockReturnValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 3600
      });

      const result = await authService.login(loginData);

      expect(result.user.email).toBe(mockUser.email);
      expect(result.tokens.accessToken).toBe('access-token');
      expect(result.mfaRequired).toBe(false);
    });

    it('should require MFA when enabled', async () => {
      const loginData: LoginRequest = {
        email: 'test@example.com',
        password: 'password123'
      };

      const userWithMFA = {
        ...mockUser,
        mfa: { enabled: true, enforced: false }
      };

      jest.spyOn(authService, 'getUserByEmail').mockResolvedValue(userWithMFA);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);

      const result = await authService.login(loginData);

      expect(result.mfaRequired).toBe(true);
      expect(result.tokens.accessToken).toBe('');
    });

    it('should verify MFA code when provided', async () => {
      const loginData: LoginRequest = {
        email: 'test@example.com',
        password: 'password123',
        mfaCode: '123456'
      };

      const userWithMFA = {
        ...mockUser,
        mfa: { enabled: true, secret: 'test-secret', enforced: false }
      };

      jest.spyOn(authService, 'getUserByEmail').mockResolvedValue(userWithMFA);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
      jest.spyOn(authService as any, 'verifyMFACode').mockReturnValue(true);
      jest.spyOn(authService as any, 'handleSuccessfulLogin').mockResolvedValue(undefined);

      const mockJwtService = require('../src/services/jwtService');
      mockJwtService.jwtService.generateTokens.mockReturnValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 3600
      });

      const result = await authService.login(loginData);

      expect(result.mfaRequired).toBe(false);
      expect(result.tokens.accessToken).toBe('access-token');
    });

    it('should reject invalid credentials', async () => {
      const loginData: LoginRequest = {
        email: 'test@example.com',
        password: 'wrongpassword'
      };

      jest.spyOn(authService, 'getUserByEmail').mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);
      jest.spyOn(authService as any, 'handleFailedLogin').mockResolvedValue(undefined);

      await expect(authService.login(loginData)).rejects.toThrow('Invalid credentials');
    });

    it('should handle account lockout', async () => {
      const loginData: LoginRequest = {
        email: 'test@example.com',
        password: 'password123'
      };

      const lockedUser = {
        ...mockUser,
        lockoutUntil: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes from now
      };

      jest.spyOn(authService, 'getUserByEmail').mockResolvedValue(lockedUser);

      await expect(authService.login(loginData)).rejects.toThrow('Account is temporarily locked');
    });

    it('should reject login for non-existent user', async () => {
      const loginData: LoginRequest = {
        email: 'nonexistent@example.com',
        password: 'password123'
      };

      jest.spyOn(authService, 'getUserByEmail').mockResolvedValue(null);

      await expect(authService.login(loginData)).rejects.toThrow('Invalid credentials');
    });
  });

  describe('Token Management', () => {
    it('should refresh token successfully', async () => {
      const refreshToken = 'valid-refresh-token';

      const mockJwtService = require('../src/services/jwtService');
      mockJwtService.jwtService.verifyToken.mockReturnValue({
        userId: 'test-user-id',
        type: 'refresh'
      });
      mockJwtService.jwtService.generateTokens.mockReturnValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresIn: 3600
      });

      jest.spyOn(authService, 'getUserById').mockResolvedValue(mockUser);

      const result = await authService.refreshToken(refreshToken);

      expect(result.accessToken).toBe('new-access-token');
      expect(result.refreshToken).toBe('new-refresh-token');
    });

    it('should reject invalid refresh token', async () => {
      const refreshToken = 'invalid-refresh-token';

      const mockJwtService = require('../src/services/jwtService');
      mockJwtService.jwtService.verifyToken.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(authService.refreshToken(refreshToken)).rejects.toThrow('Invalid refresh token');
    });

    it('should reject refresh token with wrong type', async () => {
      const refreshToken = 'access-token-used-as-refresh';

      const mockJwtService = require('../src/services/jwtService');
      mockJwtService.jwtService.verifyToken.mockReturnValue({
        userId: 'test-user-id',
        type: 'access'
      });

      await expect(authService.refreshToken(refreshToken)).rejects.toThrow('Invalid refresh token');
    });
  });

  describe('User Management', () => {
    it('should get user by ID', async () => {
      const mockDatastore = require('../src/database/datastore');
      mockDatastore.datastoreClient.createKey.mockReturnValue('user-key');
      mockDatastore.datastoreClient.get.mockResolvedValue(mockUser);

      const result = await authService.getUserById('test-user-id');

      expect(result).toEqual(mockUser);
    });

    it('should get user by email', async () => {
      const mockDatastore = require('../src/database/datastore');
      const mockQuery = {
        filter: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis()
      };
      mockDatastore.datastoreClient.getDatastore.mockReturnValue({
        createQuery: jest.fn().mockReturnValue(mockQuery)
      });
      mockDatastore.datastoreClient.runQuery.mockResolvedValue([mockUser]);

      const result = await authService.getUserByEmail('test@example.com');

      expect(result).toEqual(mockUser);
    });

    it('should update user successfully', async () => {
      const updates = { name: 'Updated Name' };
      const updatedUser = { ...mockUser, ...updates };

      jest.spyOn(authService, 'getUserById').mockResolvedValue(mockUser);
      
      const mockDatastore = require('../src/database/datastore');
      mockDatastore.datastoreClient.createKey.mockReturnValue('user-key');
      mockDatastore.datastoreClient.save.mockResolvedValue(undefined);

      const result = await authService.updateUser('test-user-id', updates);

      expect(result.name).toBe('Updated Name');
    });

    it('should change password successfully', async () => {
      jest.spyOn(authService, 'getUserById').mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare')
        .mockResolvedValueOnce(true as never) // current password check
        .mockResolvedValueOnce(false as never); // new password different check
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('new-hashed-password' as never);

      const mockDatastore = require('../src/database/datastore');
      mockDatastore.datastoreClient.createKey.mockReturnValue('user-key');
      mockDatastore.datastoreClient.save.mockResolvedValue(undefined);

      await expect(
        authService.changePassword('test-user-id', 'currentPassword', 'newPassword')
      ).resolves.not.toThrow();
    });

    it('should reject password change with wrong current password', async () => {
      jest.spyOn(authService, 'getUserById').mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

      await expect(
        authService.changePassword('test-user-id', 'wrongPassword', 'newPassword')
      ).rejects.toThrow('Current password is incorrect');
    });
  });

  describe('User Statistics', () => {
    it('should get user statistics', async () => {
      const mockUsers = [
        { ...mockUser, status: 'active', roles: [USER_ROLES.USER] },
        { ...mockUser, id: 'user2', status: 'inactive', roles: [USER_ROLES.ADMIN] },
        { ...mockUser, id: 'user3', status: 'suspended', roles: [USER_ROLES.USER] }
      ];

      const mockDatastore = require('../src/database/datastore');
      mockDatastore.datastoreClient.getDatastore.mockReturnValue({
        createQuery: jest.fn().mockReturnValue({}),
        runQuery: jest.fn().mockResolvedValue([mockUsers])
      });

      const result = await authService.getUserStats();

      expect(result.total).toBe(3);
      expect(result.active).toBe(1);
      expect(result.inactive).toBe(1);
      expect(result.suspended).toBe(1);
      expect(result.byRole[USER_ROLES.USER]).toBe(2);
      expect(result.byRole[USER_ROLES.ADMIN]).toBe(1);
    });
  });

  describe('OAuth Integration', () => {
    it('should handle OAuth login for existing user', async () => {
      const mockOAuthService = require('../src/services/oauthService');
      mockOAuthService.oauthService.exchangeCodeForToken.mockResolvedValue({
        accessToken: 'oauth-access-token',
        refreshToken: 'oauth-refresh-token',
        expiresIn: 3600,
        tokenType: 'Bearer'
      });
      mockOAuthService.oauthService.getUserInfo.mockResolvedValue({
        id: 'google-123',
        email: 'test@example.com',
        name: 'Test User',
        provider: 'google'
      });

      jest.spyOn(authService, 'getUserByEmail').mockResolvedValue(mockUser);
      jest.spyOn(authService as any, 'handleSuccessfulLogin').mockResolvedValue(undefined);

      const mockJwtService = require('../src/services/jwtService');
      mockJwtService.jwtService.generateTokens.mockReturnValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 3600
      });

      const result = await authService.oauthLogin('google', 'auth-code');

      expect(result.user.email).toBe(mockUser.email);
      expect(result.isNewUser).toBe(false);
      expect(result.tokens.accessToken).toBe('access-token');
    });

    it('should create new user for OAuth login', async () => {
      const mockOAuthService = require('../src/services/oauthService');
      mockOAuthService.oauthService.exchangeCodeForToken.mockResolvedValue({
        accessToken: 'oauth-access-token',
        refreshToken: 'oauth-refresh-token',
        expiresIn: 3600,
        tokenType: 'Bearer'
      });
      mockOAuthService.oauthService.getUserInfo.mockResolvedValue({
        id: 'google-123',
        email: 'newuser@example.com',
        name: 'New User',
        provider: 'google'
      });

      jest.spyOn(authService, 'getUserByEmail').mockResolvedValue(null);
      jest.spyOn(authService, 'register').mockResolvedValue({
        user: { ...mockUser, email: 'newuser@example.com', name: 'New User' },
        tokens: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresIn: 3600
        }
      });
      jest.spyOn(authService as any, 'handleSuccessfulLogin').mockResolvedValue(undefined);

      const mockJwtService = require('../src/services/jwtService');
      mockJwtService.jwtService.generateTokens.mockReturnValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 3600
      });

      const result = await authService.oauthLogin('google', 'auth-code');

      expect(result.user.email).toBe('newuser@example.com');
      expect(result.isNewUser).toBe(true);
    });
  });
});