import * as bcrypt from 'bcryptjs';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import { datastoreClient } from '../database/datastore';
import { jwtService } from './jwtService';
import { createError } from '../middleware/errors';
import { 
  User, 
  CreateUserRequest, 
  LoginRequest, 
  AuthTokens, 
  MFASetupResponse,
  DEFAULT_USER_PREFERENCES,
  USER_ROLES,
  OAuthUserInfo
} from '../models/User';
import { config } from '../config/config';
import { oauthService } from './oauthService';

export class AuthService {
  private readonly USER_KIND = 'User';
  private readonly MAX_LOGIN_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

  async register(userData: CreateUserRequest): Promise<{ user: User; tokens: AuthTokens }> {
    // Check if user already exists
    const existingUser = await this.getUserByEmail(userData.email);
    if (existingUser) {
      throw createError('User already exists', 409, 'USER_EXISTS');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(userData.password, config.bcrypt.saltRounds);

    // Create user entity
    const userKey = datastoreClient.createKey(this.USER_KIND);
    const user: User = {
      email: userData.email.toLowerCase(),
      name: userData.name,
      passwordHash,
      roles: userData.roles || [USER_ROLES.USER],
      preferences: DEFAULT_USER_PREFERENCES,
      mfa: {
        enabled: false,
        enforced: this.shouldEnforceMFA(userData.roles || [USER_ROLES.USER])
      },
      createdAt: new Date(),
      status: 'active',
      emailVerified: false,
      loginAttempts: 0
    };

    const userEntity = {
      key: userKey,
      data: user
    };

    await datastoreClient.save(userEntity);
    
    // Set the ID from the generated key
    user.id = userKey.id || userKey.name;

    // Generate tokens
    const tokens = jwtService.generateTokens(user);

    return { user, tokens };
  }

  async login(loginData: LoginRequest): Promise<{ 
    user: User; 
    tokens: AuthTokens; 
    mfaRequired: boolean 
  }> {
    const user = await this.getUserByEmail(loginData.email);
    if (!user) {
      throw createError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
    }

    // Check if account is locked
    if (user.lockoutUntil && user.lockoutUntil > new Date()) {
      throw createError('Account is temporarily locked', 423, 'ACCOUNT_LOCKED');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(loginData.password, user.passwordHash);
    if (!isPasswordValid) {
      await this.handleFailedLogin(user);
      throw createError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
    }

    // Check if MFA is required (enabled or enforced)
    const mfaRequired = user.mfa.enabled || user.mfa.enforced;
    if (mfaRequired && !loginData.mfaCode) {
      return {
        user,
        tokens: { accessToken: '', refreshToken: '', expiresIn: 0 },
        mfaRequired: true
      };
    }

    // Verify MFA if provided and required
    if (mfaRequired && loginData.mfaCode) {
      const isMFAValid = await this.verifyMFACode(user, loginData.mfaCode);
      if (!isMFAValid) {
        throw createError('Invalid MFA code', 401, 'INVALID_MFA_CODE');
      }
    }

    // Reset login attempts and update last login
    await this.handleSuccessfulLogin(user);

    // Generate tokens
    const tokens = jwtService.generateTokens(user);

    return { user, tokens, mfaRequired: false };
  }

  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    try {
      const payload = jwtService.verifyToken(refreshToken);
      
      if (payload.type !== 'refresh') {
        throw createError('Invalid token type', 401, 'INVALID_TOKEN_TYPE');
      }

      const user = await this.getUserById(payload.userId);
      if (!user) {
        throw createError('User not found', 404, 'USER_NOT_FOUND');
      }

      if (user.status !== 'active') {
        throw createError('User account is not active', 401, 'ACCOUNT_INACTIVE');
      }

      return jwtService.generateTokens(user);
    } catch (error) {
      throw createError('Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN');
    }
  }

  async getUserById(userId: string): Promise<User | null> {
    try {
      const userKey = datastoreClient.createKey(this.USER_KIND, userId);
      const user = await datastoreClient.get(userKey);
      return user || null;
    } catch (error) {
      console.error('Error getting user by ID:', error);
      return null;
    }
  }

  async getUserByEmail(email: string): Promise<User | null> {
    try {
      const query = datastoreClient.getDatastore()
        .createQuery(this.USER_KIND)
        .filter('email', '=', email.toLowerCase())
        .limit(1);

      const users = await datastoreClient.runQuery(query);
      return users.length > 0 ? users[0] : null;
    } catch (error) {
      console.error('Error getting user by email:', error);
      return null;
    }
  }

  async updateUser(userId: string, updates: Partial<User>): Promise<User> {
    const user = await this.getUserById(userId);
    if (!user) {
      throw createError('User not found', 404, 'USER_NOT_FOUND');
    }

    // Merge updates with existing user data
    const updatedUser = { ...user, ...updates };
    
    // Ensure certain fields cannot be updated directly
    delete (updatedUser as any).id;
    delete (updatedUser as any).passwordHash;
    delete (updatedUser as any).createdAt;

    const userKey = datastoreClient.createKey(this.USER_KIND, userId);
    const userEntity = {
      key: userKey,
      data: updatedUser
    };

    await datastoreClient.save(userEntity);
    updatedUser.id = userId;

    return updatedUser;
  }

  async setupMFA(userId: string): Promise<MFASetupResponse> {
    const user = await this.getUserById(userId);
    if (!user) {
      throw createError('User not found', 404, 'USER_NOT_FOUND');
    }

    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `${config.mfa.issuer} (${user.email})`,
      issuer: config.mfa.issuer,
      length: 32
    });

    // Generate QR code
    const qrCode = await QRCode.toDataURL(secret.otpauth_url!);

    // Generate backup codes
    const backupCodes = this.generateBackupCodes();

    // Update user with MFA secret (but don't enable yet)
    await this.updateUser(userId, {
      mfa: {
        ...user.mfa,
        secret: secret.base32,
        backupCodes
      }
    });

    return {
      secret: secret.base32!,
      qrCode,
      backupCodes
    };
  }

  async verifyMFA(userId: string, code: string): Promise<boolean> {
    const user = await this.getUserById(userId);
    if (!user || !user.mfa.secret) {
      throw createError('MFA not set up', 400, 'MFA_NOT_SETUP');
    }

    const isValid = this.verifyMFACode(user, code);
    
    if (isValid && !user.mfa.enabled) {
      // Enable MFA after first successful verification
      await this.updateUser(userId, {
        mfa: {
          ...user.mfa,
          enabled: true
        }
      });
    }

    return isValid;
  }

  async disableMFA(userId: string, password: string): Promise<void> {
    const user = await this.getUserById(userId);
    if (!user) {
      throw createError('User not found', 404, 'USER_NOT_FOUND');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw createError('Invalid password', 401, 'INVALID_PASSWORD');
    }

    // Disable MFA
    await this.updateUser(userId, {
      mfa: {
        enabled: false,
        secret: undefined,
        backupCodes: undefined,
        lastUsedCode: undefined
      }
    });
  }

  private async handleFailedLogin(user: User): Promise<void> {
    const loginAttempts = (user.loginAttempts || 0) + 1;
    const updates: Partial<User> = { loginAttempts };

    if (loginAttempts >= this.MAX_LOGIN_ATTEMPTS) {
      updates.lockoutUntil = new Date(Date.now() + this.LOCKOUT_DURATION);
    }

    await this.updateUser(user.id!, updates);
  }

  private async handleSuccessfulLogin(user: User): Promise<void> {
    await this.updateUser(user.id!, {
      loginAttempts: 0,
      lockoutUntil: undefined,
      lastLoginAt: new Date()
    });
  }

  private verifyMFACode(user: User, code: string): boolean {
    if (!user.mfa.secret) return false;

    // Check if it's a backup code
    if (user.mfa.backupCodes?.includes(code)) {
      // Remove used backup code
      const updatedBackupCodes = user.mfa.backupCodes.filter(c => c !== code);
      this.updateUser(user.id!, {
        mfa: {
          ...user.mfa,
          backupCodes: updatedBackupCodes,
          lastUsedCode: code
        }
      });
      return true;
    }

    // Verify TOTP code
    return speakeasy.totp.verify({
      secret: user.mfa.secret,
      encoding: 'base32',
      token: code,
      window: config.mfa.window
    });
  }

  private generateBackupCodes(): string[] {
    const codes: string[] = [];
    for (let i = 0; i < 10; i++) {
      codes.push(Math.random().toString(36).substring(2, 10).toUpperCase());
    }
    return codes;
  }

  /**
   * Determine if MFA should be enforced for user roles
   */
  private shouldEnforceMFA(roles: string[]): boolean {
    if (config.mfaPolicy.enforceForAllUsers) {
      return true;
    }
    
    if (config.mfaPolicy.enforceForAdmins && roles.includes(USER_ROLES.ADMIN)) {
      return true;
    }
    
    return false;
  }

  /**
   * Enforce MFA for a specific user
   */
  async enforceMFAForUser(userId: string, enforced: boolean = true): Promise<User> {
    const user = await this.getUserById(userId);
    if (!user) {
      throw createError('User not found', 404, 'USER_NOT_FOUND');
    }

    const updates: Partial<User> = {
      mfa: {
        ...user.mfa,
        enforced,
        enforcedAt: enforced ? new Date() : undefined
      }
    };

    return await this.updateUser(userId, updates);
  }

  /**
   * Check if user needs to set up MFA within grace period
   */
  async checkMFAGracePeriod(userId: string): Promise<{
    gracePeriodExpired: boolean;
    daysRemaining: number;
    mustSetupMFA: boolean;
  }> {
    const user = await this.getUserById(userId);
    if (!user) {
      throw createError('User not found', 404, 'USER_NOT_FOUND');
    }

    if (!user.mfa.enforced || user.mfa.enabled) {
      return {
        gracePeriodExpired: false,
        daysRemaining: 0,
        mustSetupMFA: false
      };
    }

    const enforcedDate = user.mfa.enforcedAt || user.createdAt;
    const gracePeriodEnd = new Date(enforcedDate.getTime() + (config.mfaPolicy.gracePeriodDays * 24 * 60 * 60 * 1000));
    const now = new Date();
    const daysRemaining = Math.max(0, Math.ceil((gracePeriodEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));

    return {
      gracePeriodExpired: now > gracePeriodEnd,
      daysRemaining,
      mustSetupMFA: user.mfa.enforced && !user.mfa.enabled
    };
  }

  /**
   * OAuth login/registration
   */
  async oauthLogin(providerId: string, code: string): Promise<{
    user: User;
    tokens: AuthTokens;
    isNewUser: boolean;
  }> {
    // Exchange code for token
    const tokenResponse = await oauthService.exchangeCodeForToken(providerId, code);
    
    // Get user info from OAuth provider
    const oauthUserInfo = await oauthService.getUserInfo(providerId, tokenResponse.accessToken);
    
    // Check if user exists
    let user = await this.getUserByEmail(oauthUserInfo.email);
    let isNewUser = false;

    if (!user) {
      // Create new user
      const userData: CreateUserRequest = {
        email: oauthUserInfo.email,
        name: oauthUserInfo.name,
        password: Math.random().toString(36).substring(2, 15), // Random password for OAuth users
        roles: [USER_ROLES.USER]
      };

      const result = await this.register(userData);
      user = result.user;
      isNewUser = true;
    }

    // Update last login
    await this.handleSuccessfulLogin(user);

    // Generate tokens
    const tokens = jwtService.generateTokens(user);

    return { user, tokens, isNewUser };
  }

  /**
   * Get OAuth authorization URL
   */
  getOAuthAuthorizationUrl(providerId: string, state?: string): string {
    return oauthService.getAuthorizationUrl(providerId, state);
  }

  /**
   * Get available OAuth providers
   */
  getAvailableOAuthProviders(): Array<{ id: string; name: string }> {
    return oauthService.getAvailableProviders();
  }

  /**
   * Generate MFA recovery codes
   */
  async generateMFARecoveryCodes(userId: string): Promise<string[]> {
    const user = await this.getUserById(userId);
    if (!user) {
      throw createError('User not found', 404, 'USER_NOT_FOUND');
    }

    if (!user.mfa.enabled) {
      throw createError('MFA is not enabled', 400, 'MFA_NOT_ENABLED');
    }

    const newBackupCodes = this.generateBackupCodes();
    
    await this.updateUser(userId, {
      mfa: {
        ...user.mfa,
        backupCodes: newBackupCodes
      }
    });

    return newBackupCodes;
  }

  // User Management Methods

  /**
   * Get all users with pagination and sorting
   */
  async getAllUsers(options: {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}): Promise<{
    data: any[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  }> {
    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = options;

    try {
      // Create query with sorting
      let query = datastoreClient.getDatastore()
        .createQuery(this.USER_KIND)
        .order(sortBy, { descending: sortOrder === 'desc' });

      // Calculate offset
      const offset = (page - 1) * limit;
      query = query.limit(limit).offset(offset);

      // Execute query
      const [users] = await datastoreClient.getDatastore().runQuery(query);

      // Get total count for pagination
      const countQuery = datastoreClient.getDatastore()
        .createQuery(this.USER_KIND)
        .select('__key__');
      const [allUsers] = await datastoreClient.getDatastore().runQuery(countQuery);
      const total = allUsers.length;

      // Calculate pagination info
      const totalPages = Math.ceil(total / limit);
      const hasNext = page < totalPages;
      const hasPrev = page > 1;

      // Remove sensitive data from response
      const sanitizedUsers = users.map(user => this.sanitizeUser(user));

      return {
        data: sanitizedUsers,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext,
          hasPrev
        }
      };
    } catch (error) {
      console.error('Error getting all users:', error);
      throw createError('Failed to retrieve users', 500, 'DATABASE_ERROR');
    }
  }

  /**
   * Update user roles
   */
  async updateUserRoles(userId: string, roles: string[]): Promise<User> {
    // Validate roles
    const validRoles = roles.filter(role => Object.values(USER_ROLES).includes(role as any));
    if (validRoles.length !== roles.length) {
      throw createError('Invalid roles provided', 400, 'INVALID_ROLES');
    }

    const user = await this.getUserById(userId);
    if (!user) {
      throw createError('User not found', 404, 'USER_NOT_FOUND');
    }

    // Update user roles
    const updatedUser = { ...user, roles: validRoles };
    
    const userKey = datastoreClient.createKey(this.USER_KIND, userId);
    const userEntity = {
      key: userKey,
      data: updatedUser
    };

    try {
      await datastoreClient.save(userEntity);
      updatedUser.id = userId;
      return updatedUser;
    } catch (error) {
      console.error('Error updating user roles:', error);
      throw createError('Failed to update user roles', 500, 'DATABASE_ERROR');
    }
  }

  /**
   * Update user status
   */
  async updateUserStatus(userId: string, status: 'active' | 'inactive' | 'suspended' | 'pending'): Promise<User> {
    const user = await this.getUserById(userId);
    if (!user) {
      throw createError('User not found', 404, 'USER_NOT_FOUND');
    }

    // Update user status
    const updatedUser = { ...user, status };
    
    const userKey = datastoreClient.createKey(this.USER_KIND, userId);
    const userEntity = {
      key: userKey,
      data: updatedUser
    };

    try {
      await datastoreClient.save(userEntity);
      updatedUser.id = userId;
      return updatedUser;
    } catch (error) {
      console.error('Error updating user status:', error);
      throw createError('Failed to update user status', 500, 'DATABASE_ERROR');
    }
  }

  /**
   * Change user password
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.getUserById(userId);
    if (!user) {
      throw createError('User not found', 404, 'USER_NOT_FOUND');
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isCurrentPasswordValid) {
      throw createError('Current password is incorrect', 400, 'INVALID_CURRENT_PASSWORD');
    }

    // Check if new password is different from current
    const isSamePassword = await bcrypt.compare(newPassword, user.passwordHash);
    if (isSamePassword) {
      throw createError('New password must be different from current password', 400, 'SAME_PASSWORD');
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, config.bcrypt.saltRounds);

    // Update user password
    const updatedUser = { ...user, passwordHash: newPasswordHash };
    
    const userKey = datastoreClient.createKey(this.USER_KIND, userId);
    const userEntity = {
      key: userKey,
      data: updatedUser
    };

    try {
      await datastoreClient.save(userEntity);
    } catch (error) {
      console.error('Error changing password:', error);
      throw createError('Failed to change password', 500, 'DATABASE_ERROR');
    }
  }

  /**
   * Delete user (soft delete by setting status to inactive)
   */
  async deleteUser(userId: string): Promise<void> {
    const user = await this.getUserById(userId);
    if (!user) {
      throw createError('User not found', 404, 'USER_NOT_FOUND');
    }

    // Soft delete by setting status to inactive
    await this.updateUserStatus(userId, 'inactive');
  }

  /**
   * Search users by email or name
   */
  async searchUsers(searchTerm: string, options: {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}): Promise<{
    data: any[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  }> {
    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = options;

    try {
      // Note: Datastore doesn't support full-text search, so we'll do a simple filter
      const query = datastoreClient.getDatastore()
        .createQuery(this.USER_KIND)
        .filter('email', '>=', searchTerm.toLowerCase())
        .filter('email', '<', searchTerm.toLowerCase() + '\ufffd')
        .order(sortBy, { descending: sortOrder === 'desc' })
        .limit(limit)
        .offset((page - 1) * limit);

      const [users] = await datastoreClient.getDatastore().runQuery(query);

      // Remove sensitive data
      const sanitizedUsers = users.map(user => this.sanitizeUser(user));

      const total = users.length;
      const totalPages = Math.ceil(total / limit);

      return {
        data: sanitizedUsers,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      };
    } catch (error) {
      console.error('Error searching users:', error);
      throw createError('Failed to search users', 500, 'DATABASE_ERROR');
    }
  }

  /**
   * Get users by role
   */
  async getUsersByRole(role: string, options: {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}): Promise<{
    data: any[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  }> {
    if (!Object.values(USER_ROLES).includes(role as any)) {
      throw createError('Invalid role', 400, 'INVALID_ROLE');
    }

    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = options;

    try {
      const query = datastoreClient.getDatastore()
        .createQuery(this.USER_KIND)
        .filter('roles', '=', role)
        .order(sortBy, { descending: sortOrder === 'desc' })
        .limit(limit)
        .offset((page - 1) * limit);

      const [users] = await datastoreClient.getDatastore().runQuery(query);

      // Remove sensitive data
      const sanitizedUsers = users.map(user => this.sanitizeUser(user));

      const totalPages = Math.ceil(users.length / limit);

      return {
        data: sanitizedUsers,
        pagination: {
          page,
          limit,
          total: users.length,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      };
    } catch (error) {
      console.error('Error getting users by role:', error);
      throw createError('Failed to retrieve users by role', 500, 'DATABASE_ERROR');
    }
  }

  /**
   * Get user statistics
   */
  async getUserStats(): Promise<{
    total: number;
    active: number;
    inactive: number;
    suspended: number;
    pending: number;
    byRole: Record<string, number>;
  }> {
    try {
      const query = datastoreClient.getDatastore().createQuery(this.USER_KIND);
      const [users] = await datastoreClient.getDatastore().runQuery(query);

      const stats = {
        total: users.length,
        active: 0,
        inactive: 0,
        suspended: 0,
        pending: 0,
        byRole: {} as Record<string, number>
      };

      users.forEach(user => {
        // Count by status
        stats[user.status as keyof typeof stats]++;

        // Count by roles
        user.roles.forEach((role: string) => {
          stats.byRole[role] = (stats.byRole[role] || 0) + 1;
        });
      });

      return stats;
    } catch (error) {
      console.error('Error getting user stats:', error);
      throw createError('Failed to retrieve user statistics', 500, 'DATABASE_ERROR');
    }
  }

  /**
   * Remove sensitive data from user object
   */
  private sanitizeUser(user: User): any {
    const { passwordHash, mfa, ...sanitizedUser } = user;
    return {
      ...sanitizedUser,
      mfa: {
        enabled: mfa.enabled
      }
    };
  }
}