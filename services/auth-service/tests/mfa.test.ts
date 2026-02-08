import { AuthService } from '../src/services/authService';
import { User, USER_ROLES } from '../src/models/User';
import * as speakeasy from 'speakeasy';

describe('MFA Functionality', () => {
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
  });

  describe('MFA Setup', () => {
    it('should generate MFA setup response with secret and QR code', async () => {
      // Mock getUserById to return our test user
      jest.spyOn(authService, 'getUserById').mockResolvedValue(mockUser);
      jest.spyOn(authService, 'updateUser').mockResolvedValue(mockUser);

      const result = await authService.setupMFA('test-user-id');

      expect(result).toHaveProperty('secret');
      expect(result).toHaveProperty('qrCode');
      expect(result).toHaveProperty('backupCodes');
      expect(result.backupCodes).toHaveLength(10);
      expect(typeof result.secret).toBe('string');
      expect(result.qrCode).toMatch(/^data:image\/png;base64,/);
    });

    it('should throw error if user not found', async () => {
      jest.spyOn(authService, 'getUserById').mockResolvedValue(null);

      await expect(authService.setupMFA('non-existent-user')).rejects.toThrow('User not found');
    });
  });

  describe('MFA Verification', () => {
    it('should verify valid TOTP code', async () => {
      const secret = speakeasy.generateSecret({ length: 32 });
      const token = speakeasy.totp({
        secret: secret.base32,
        encoding: 'base32'
      });

      const userWithMFA = {
        ...mockUser,
        mfa: {
          enabled: false,
          secret: secret.base32,
          enforced: false
        }
      };

      jest.spyOn(authService, 'getUserById').mockResolvedValue(userWithMFA);
      jest.spyOn(authService, 'updateUser').mockResolvedValue({
        ...userWithMFA,
        mfa: { ...userWithMFA.mfa, enabled: true }
      });

      const result = await authService.verifyMFA('test-user-id', token);
      expect(result).toBe(true);
    });

    it('should verify valid backup code', async () => {
      const backupCodes = ['BACKUP123', 'BACKUP456'];
      const userWithMFA = {
        ...mockUser,
        mfa: {
          enabled: true,
          secret: 'test-secret',
          backupCodes,
          enforced: false
        }
      };

      jest.spyOn(authService, 'getUserById').mockResolvedValue(userWithMFA);
      jest.spyOn(authService, 'updateUser').mockResolvedValue(userWithMFA);

      const result = await authService.verifyMFA('test-user-id', 'BACKUP123');
      expect(result).toBe(true);
    });

    it('should reject invalid MFA code', async () => {
      const userWithMFA = {
        ...mockUser,
        mfa: {
          enabled: true,
          secret: 'test-secret',
          backupCodes: ['BACKUP123'],
          enforced: false
        }
      };

      jest.spyOn(authService, 'getUserById').mockResolvedValue(userWithMFA);

      const result = await authService.verifyMFA('test-user-id', 'INVALID');
      expect(result).toBe(false);
    });
  });

  describe('MFA Enforcement', () => {
    it('should enforce MFA for a user', async () => {
      jest.spyOn(authService, 'getUserById').mockResolvedValue(mockUser);
      jest.spyOn(authService, 'updateUser').mockResolvedValue({
        ...mockUser,
        mfa: { ...mockUser.mfa, enforced: true, enforcedAt: new Date() }
      });

      const result = await authService.enforceMFAForUser('test-user-id', true);
      expect(result.mfa.enforced).toBe(true);
      expect(result.mfa.enforcedAt).toBeDefined();
    });

    it('should check MFA grace period correctly', async () => {
      const enforcedUser = {
        ...mockUser,
        mfa: {
          enabled: false,
          enforced: true,
          enforcedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) // 10 days ago
        }
      };

      jest.spyOn(authService, 'getUserById').mockResolvedValue(enforcedUser);

      const result = await authService.checkMFAGracePeriod('test-user-id');
      expect(result.mustSetupMFA).toBe(true);
      expect(result.daysRemaining).toBeGreaterThan(0);
      expect(result.gracePeriodExpired).toBe(false);
    });
  });

  describe('MFA Disable', () => {
    it('should disable MFA with correct password', async () => {
      const userWithMFA = {
        ...mockUser,
        mfa: {
          enabled: true,
          secret: 'test-secret',
          backupCodes: ['BACKUP123'],
          enforced: false
        }
      };

      jest.spyOn(authService, 'getUserById').mockResolvedValue(userWithMFA);
      jest.spyOn(authService, 'updateUser').mockResolvedValue({
        ...userWithMFA,
        mfa: { enabled: false }
      });

      // Mock bcrypt.compare to return true for correct password
      const bcrypt = require('bcryptjs');
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);

      await expect(authService.disableMFA('test-user-id', 'correct-password')).resolves.not.toThrow();
    });

    it('should reject MFA disable with incorrect password', async () => {
      jest.spyOn(authService, 'getUserById').mockResolvedValue(mockUser);

      // Mock bcrypt.compare to return false for incorrect password
      const bcrypt = require('bcryptjs');
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false);

      await expect(authService.disableMFA('test-user-id', 'wrong-password')).rejects.toThrow('Invalid password');
    });
  });

  describe('Recovery Codes', () => {
    it('should generate new recovery codes', async () => {
      const userWithMFA = {
        ...mockUser,
        mfa: {
          enabled: true,
          secret: 'test-secret',
          backupCodes: ['OLD1', 'OLD2'],
          enforced: false
        }
      };

      jest.spyOn(authService, 'getUserById').mockResolvedValue(userWithMFA);
      jest.spyOn(authService, 'updateUser').mockResolvedValue(userWithMFA);

      const newCodes = await authService.generateMFARecoveryCodes('test-user-id');
      expect(newCodes).toHaveLength(10);
      expect(newCodes.every(code => typeof code === 'string')).toBe(true);
    });

    it('should throw error if MFA not enabled', async () => {
      jest.spyOn(authService, 'getUserById').mockResolvedValue(mockUser);

      await expect(authService.generateMFARecoveryCodes('test-user-id')).rejects.toThrow('MFA is not enabled');
    });
  });
});