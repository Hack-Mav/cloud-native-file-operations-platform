import * as bcrypt from 'bcryptjs';
import { datastoreClient } from '../database/datastore';
import { createError } from '../middleware/errors';
import { User, USER_ROLES } from '../models/User';
import { config } from '../config/config';

export interface PaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export type SanitizedUser = Omit<User, 'passwordHash' | 'mfa'> & { mfa: { enabled: boolean } };

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export class UserService {
  private readonly USER_KIND = 'User';

  /**
   * Get all users with pagination and sorting
   */
  async getAllUsers(options: PaginationOptions = {}): Promise<PaginatedResult<SanitizedUser>> {
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
   * Get user by ID
   */
  async getUserById(userId: string): Promise<User | null> {
    try {
      const userKey = datastoreClient.createKey(this.USER_KIND, userId);
      const [user] = await datastoreClient.get(userKey);
      
      if (!user) {
        return null;
      }

      // Add ID to user object
      user.id = userKey.id || userKey.name;
      return user;
    } catch (error) {
      console.error('Error getting user by ID:', error);
      return null;
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
  async searchUsers(searchTerm: string, options: PaginationOptions = {}): Promise<PaginatedResult<SanitizedUser>> {
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
  async getUsersByRole(role: string, options: PaginationOptions = {}): Promise<PaginatedResult<SanitizedUser>> {
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
  private sanitizeUser(user: User): SanitizedUser {
    const { passwordHash, mfa, ...sanitizedUser } = user;
    return {
      ...sanitizedUser,
      mfa: {
        enabled: mfa.enabled
      }
    };
  }
}