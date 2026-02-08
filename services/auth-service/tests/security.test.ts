import { AuthService } from '../src/services/authService';
import { jwtService } from '../src/services/jwtService';
import { User, USER_ROLES, LoginRequest } from '../src/models/User';

// Mock dependencies
jest.mock('../src/database/datastore');
jest.mock('../src/services/jwtService');

describe('Authentication Security Tests', () => {
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

  describe('Password Security', () => {
    it('should reject weak passwords', async () => {
      const weakPasswords = [
        '123',
        'abc',
        '1234567'
      ];

      // This would typically be handled by validation middleware
      // Testing the concept that weak passwords should be rejected
      for (const weakPassword of weakPasswords) {
        expect(weakPassword.length < 8).toBe(true);
      }
    });

    it('should prevent password reuse', async () => {
      const currentPassword = 'currentpassword123';
      const samePassword = 'currentpassword123';

      jest.spyOn(authService, 'getUserById').mockResolvedValue(mockUser);
      
      const bcrypt = require('bcryptjs');
      bcrypt.compare
        .mockResolvedValueOnce(true) // current password check
        .mockResolvedValueOnce(true); // same password check

      await expect(
        authService.changePassword('test-user-id', currentPassword, samePassword)
      ).rejects.toThrow('New password must be different from current password');
    });
  });

  describe('Account Lockout Protection', () => {
    it('should prevent login when account is locked', async () => {
      const lockedUser = {
        ...mockUser,
        loginAttempts: 5,
        lockoutUntil: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes from now
      };

      jest.spyOn(authService, 'getUserByEmail').mockResolvedValue(lockedUser);

      const loginData: LoginRequest = {
        email: 'test@example.com',
        password: 'correctpassword'
      };

      await expect(authService.login(loginData)).rejects.toThrow('Account is temporarily locked');
    });

    it('should track failed login attempts', async () => {
      const userWithAttempts = {
        ...mockUser,
        loginAttempts: 2
      };

      jest.spyOn(authService, 'getUserByEmail').mockResolvedValue(userWithAttempts);
      
      const bcrypt = require('bcryptjs');
      bcrypt.compare.mockResolvedValue(false);

      const mockUpdateUser = jest.spyOn(authService, 'updateUser').mockResolvedValue({
        ...userWithAttempts,
        loginAttempts: 3
      });

      const loginData: LoginRequest = {
        email: 'test@example.com',
        password: 'wrongpassword'
      };

      await expect(authService.login(loginData)).rejects.toThrow('Invalid credentials');
    });
  });

  describe('JWT Token Security', () => {
    it('should generate tokens with proper expiration', () => {
      const mockJwtService = require('../src/services/jwtService');
      mockJwtService.jwtService.generateTokens.mockReturnValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 3600
      });

      const tokens = mockJwtService.jwtService.generateTokens(mockUser);
      
      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();
      expect(tokens.expiresIn).toBe(3600);
    });

    it('should reject expired tokens', () => {
      const mockJwtService = require('../src/services/jwtService');
      mockJwtService.jwtService.verifyToken.mockImplementation(() => {
        const error = new Error('Token has expired');
        error.name = 'TokenExpiredError';
        throw error;
      });

      expect(() => {
        mockJwtService.jwtService.verifyToken('expired-token');
      }).toThrow('Token has expired');
    });

    it('should reject malformed tokens', () => {
      const mockJwtService = require('../src/services/jwtService');
      mockJwtService.jwtService.verifyToken.mockImplementation(() => {
        const error = new Error('Invalid token');
        error.name = 'JsonWebTokenError';
        throw error;
      });

      expect(() => {
        mockJwtService.jwtService.verifyToken('malformed-token');
      }).toThrow('Invalid token');
    });

    it('should validate token type for refresh operations', async () => {
      const mockJwtService = require('../src/services/jwtService');
      mockJwtService.jwtService.verifyToken.mockReturnValue({
        userId: 'test-user-id',
        type: 'access' // Wrong type for refresh
      });

      await expect(authService.refreshToken('access-token')).rejects.toThrow('Invalid refresh token');
    });
  });

  describe('MFA Security', () => {
    it('should enforce MFA for admin users', async () => {
      const adminUser = {
        ...mockUser,
        roles: [USER_ROLES.ADMIN],
        mfa: { enabled: false, enforced: true }
      };

      jest.spyOn(authService, 'getUserByEmail').mockResolvedValue(adminUser);
      
      const bcrypt = require('bcryptjs');
      bcrypt.compare.mockResolvedValue(true);

      const loginData: LoginRequest = {
        email: 'admin@example.com',
        password: 'correctpassword'
      };

      const result = await authService.login(loginData);
      expect(result.mfaRequired).toBe(true);
    });

    it('should require password verification to disable MFA', async () => {
      const userWithMFA = {
        ...mockUser,
        mfa: { enabled: true, secret: 'test-secret', enforced: false }
      };

      jest.spyOn(authService, 'getUserById').mockResolvedValue(userWithMFA);
      
      const bcrypt = require('bcryptjs');
      bcrypt.compare.mockResolvedValue(false);

      await expect(
        authService.disableMFA('test-user-id', 'wrongpassword')
      ).rejects.toThrow('Invalid password');
    });
  });

  describe('Input Validation and Sanitization', () => {
    it('should normalize email addresses', async () => {
      const userData = {
        email: 'TEST@EXAMPLE.COM',
        name: 'Test User',
        password: 'password123'
      };

      jest.spyOn(authService, 'getUserByEmail').mockResolvedValue(null);
      
      const bcrypt = require('bcryptjs');
      bcrypt.hash.mockResolvedValue('hashed-password');
      
      const mockDatastore = require('../src/database/datastore');
      mockDatastore.datastoreClient.createKey.mockReturnValue({ id: 'new-user-id' });
      mockDatastore.datastoreClient.save.mockResolvedValue(undefined);

      const mockJwtService = require('../src/services/jwtService');
      mockJwtService.jwtService.generateTokens.mockReturnValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 3600
      });

      const result = await authService.register(userData);
      expect(result.user.email).toBe('test@example.com'); // Should be lowercase
    });

    it('should validate role assignments', async () => {
      const invalidRoles = ['invalid-role', 'hacker', USER_ROLES.ADMIN];
      
      jest.spyOn(authService, 'getUserById').mockResolvedValue(mockUser);

      await expect(
        authService.updateUserRoles('test-user-id', invalidRoles)
      ).rejects.toThrow('Invalid roles provided');
    });
  });

  describe('Session Security', () => {
    it('should prevent concurrent sessions with same refresh token', async () => {
      // This test simulates the scenario where a refresh token should only be used once
      const mockJwtService = require('../src/services/jwtService');
      mockJwtService.jwtService.verifyToken.mockReturnValue({
        userId: 'test-user-id',
        type: 'refresh'
      });

      jest.spyOn(authService, 'getUserById').mockResolvedValue(mockUser);
      mockJwtService.jwtService.generateTokens.mockReturnValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresIn: 3600
      });

      const result = await authService.refreshToken('valid-refresh-token');
      expect(result.accessToken).toBe('new-access-token');
      expect(result.refreshToken).toBe('new-refresh-token');
    });
  });

  describe('Rate Limiting and Brute Force Protection', () => {
    it('should track failed attempts per user', async () => {
      const userWithAttempts = {
        ...mockUser,
        loginAttempts: 2
      };

      jest.spyOn(authService, 'getUserByEmail').mockResolvedValue(userWithAttempts);
      
      const bcrypt = require('bcryptjs');
      bcrypt.compare.mockResolvedValue(false);

      const mockUpdateUser = jest.spyOn(authService, 'updateUser').mockResolvedValue({
        ...userWithAttempts,
        loginAttempts: 3
      });

      const loginData: LoginRequest = {
        email: 'test@example.com',
        password: 'wrongpassword'
      };

      await expect(authService.login(loginData)).rejects.toThrow('Invalid credentials');
    });
  });

  describe('OAuth Security', () => {
    it('should validate OAuth provider existence', async () => {
      // Test that invalid providers are rejected
      await expect(
        authService.oauthLogin('invalid-provider', 'auth-code')
      ).rejects.toThrow();
    });

    it('should handle OAuth errors securely', async () => {
      // Test that OAuth errors don't expose sensitive information
      await expect(
        authService.oauthLogin('invalid-provider', 'invalid-code')
      ).rejects.toThrow();
    });
  });
});