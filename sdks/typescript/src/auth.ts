/**
 * Authentication Client
 */

import { HttpClient } from './http';
import {
  User,
  AuthTokens,
  RegisterRequest,
  LoginRequest,
  AuthResponse,
  MfaSetupResponse,
  MfaVerifyResponse,
  PaginationParams,
  PaginatedResponse,
} from './types';

export class AuthClient {
  constructor(private http: HttpClient) {}

  /**
   * Register a new user
   */
  async register(data: RegisterRequest): Promise<AuthResponse> {
    const response = await this.http.post<AuthResponse>('/auth/register', data);
    this.http.setTokens(this.toTokens(response));
    return response;
  }

  /**
   * Login with email and password
   */
  async login(data: LoginRequest): Promise<AuthResponse> {
    const response = await this.http.post<AuthResponse>('/auth/login', data);
    this.http.setTokens(this.toTokens(response));
    return response;
  }

  /**
   * Refresh access token
   */
  async refresh(refreshToken?: string): Promise<AuthTokens> {
    const token = refreshToken || this.http.getTokens()?.refreshToken;
    if (!token) {
      throw new Error('No refresh token available');
    }

    const response = await this.http.post<AuthResponse>('/auth/refresh', {
      refreshToken: token,
    });

    const tokens = this.toTokens(response);
    this.http.setTokens(tokens);
    return tokens;
  }

  /**
   * Logout current user
   */
  async logout(): Promise<void> {
    await this.http.post('/auth/logout');
    this.http.clearTokens();
  }

  /**
   * Get current user profile
   */
  async getProfile(): Promise<User> {
    return this.http.get<User>('/auth/profile');
  }

  /**
   * Update current user profile
   */
  async updateProfile(data: { name?: string }): Promise<User> {
    return this.http.put<User>('/auth/profile', data);
  }

  /**
   * Change password
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await this.http.post('/auth/change-password', {
      currentPassword,
      newPassword,
    });
  }

  /**
   * Setup MFA (get secret and QR code)
   */
  async setupMfa(): Promise<MfaSetupResponse> {
    return this.http.post<MfaSetupResponse>('/auth/mfa/setup');
  }

  /**
   * Verify MFA setup with code
   */
  async verifyMfa(code: string): Promise<MfaVerifyResponse> {
    return this.http.post<MfaVerifyResponse>('/auth/mfa/verify', { code });
  }

  /**
   * Disable MFA
   */
  async disableMfa(code: string): Promise<void> {
    await this.http.post('/auth/mfa/disable', { code });
  }

  /**
   * Get MFA status
   */
  async getMfaStatus(): Promise<{
    enabled: boolean;
    enforced: boolean;
    recoveryCodesRemaining: number;
  }> {
    return this.http.get('/auth/mfa/status');
  }

  /**
   * Generate new recovery codes
   */
  async generateRecoveryCodes(): Promise<{ recoveryCodes: string[] }> {
    return this.http.post('/auth/mfa/recovery-codes');
  }

  // Admin methods

  /**
   * List all users (admin only)
   */
  async listUsers(
    params?: PaginationParams & { status?: string; role?: string }
  ): Promise<PaginatedResponse<User>> {
    return this.http.get<PaginatedResponse<User>>('/auth/users', { params });
  }

  /**
   * Search users (admin only)
   */
  async searchUsers(
    query: string,
    params?: PaginationParams
  ): Promise<PaginatedResponse<User>> {
    return this.http.get<PaginatedResponse<User>>('/auth/users/search', {
      params: { query, ...params },
    });
  }

  /**
   * Get user by ID
   */
  async getUser(userId: string): Promise<User> {
    return this.http.get<User>(`/auth/users/${userId}`);
  }

  /**
   * Update user roles (admin only)
   */
  async updateUserRoles(userId: string, roles: string[]): Promise<User> {
    return this.http.put<User>(`/auth/users/${userId}/roles`, { roles });
  }

  /**
   * Update user status (admin only)
   */
  async updateUserStatus(userId: string, status: string): Promise<User> {
    return this.http.put<User>(`/auth/users/${userId}/status`, { status });
  }

  /**
   * Delete user (admin only)
   */
  async deleteUser(userId: string): Promise<void> {
    await this.http.delete(`/auth/users/${userId}`);
  }

  /**
   * Get user statistics (admin only)
   */
  async getUserStats(): Promise<{
    total: number;
    active: number;
    inactive: number;
    byRole: Record<string, number>;
  }> {
    return this.http.get('/auth/users/stats');
  }

  /**
   * Enforce MFA for user (admin only)
   */
  async enforceMfa(userId: string, enforce: boolean): Promise<void> {
    await this.http.put(`/auth/users/${userId}/mfa/enforce`, { enforce });
  }

  /**
   * Get available OAuth providers
   */
  async getOAuthProviders(): Promise<string[]> {
    return this.http.get<string[]>('/auth/oauth/providers');
  }

  /**
   * Get OAuth authorization URL
   */
  async getOAuthUrl(provider: string): Promise<{ url: string }> {
    return this.http.get<{ url: string }>(`/auth/oauth/${provider}/auth`);
  }

  /**
   * Handle OAuth callback
   */
  async handleOAuthCallback(
    provider: string,
    code: string,
    state: string
  ): Promise<AuthResponse> {
    const response = await this.http.post<AuthResponse>(
      `/auth/oauth/${provider}/callback`,
      { code, state }
    );
    this.http.setTokens(this.toTokens(response));
    return response;
  }

  /**
   * Convert auth response to tokens
   */
  private toTokens(response: AuthResponse): AuthTokens {
    return {
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      tokenType: response.tokenType,
      expiresIn: response.expiresIn,
      expiresAt: new Date(Date.now() + response.expiresIn * 1000),
    };
  }
}
