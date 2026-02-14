import { apiClient } from './client';
import type {
  ApiResponse,
  User,
  AuthTokens,
  LoginCredentials,
  RegisterData,
} from '@/types';

interface LoginResponse {
  user: User;
  tokens: AuthTokens;
}

interface MfaRequiredResponse {
  mfaRequired: true;
  sessionToken: string;
}

type LoginResult = LoginResponse | MfaRequiredResponse;

export const authApi = {
  async login(credentials: LoginCredentials): Promise<ApiResponse<LoginResult>> {
    const response = await apiClient.post<ApiResponse<LoginResult>>(
      '/auth/login',
      credentials
    );
    return response.data;
  },

  async register(data: RegisterData): Promise<ApiResponse<LoginResponse>> {
    const response = await apiClient.post<ApiResponse<LoginResponse>>(
      '/auth/register',
      data
    );
    return response.data;
  },

  async verifyMfa(
    sessionToken: string,
    code: string
  ): Promise<ApiResponse<LoginResponse>> {
    const response = await apiClient.post<ApiResponse<LoginResponse>>(
      '/auth/mfa/verify',
      { sessionToken, code }
    );
    return response.data;
  },

  async logout(): Promise<void> {
    await apiClient.post('/auth/logout');
  },

  async refreshToken(refreshToken: string): Promise<ApiResponse<{ accessToken: string; expiresIn: number }>> {
    const response = await apiClient.post<ApiResponse<{ accessToken: string; expiresIn: number }>>(
      '/auth/refresh',
      { refreshToken }
    );
    return response.data;
  },

  async getProfile(): Promise<ApiResponse<User>> {
    const response = await apiClient.get<ApiResponse<User>>('/auth/profile');
    return response.data;
  },

  async updateProfile(data: Partial<User>): Promise<ApiResponse<User>> {
    const response = await apiClient.patch<ApiResponse<User>>(
      '/auth/profile',
      data
    );
    return response.data;
  },

  async changePassword(
    currentPassword: string,
    newPassword: string
  ): Promise<ApiResponse<void>> {
    const response = await apiClient.post<ApiResponse<void>>(
      '/auth/change-password',
      { currentPassword, newPassword }
    );
    return response.data;
  },

  async setupMfa(): Promise<ApiResponse<{ secret: string; qrCode: string }>> {
    const response = await apiClient.post<ApiResponse<{ secret: string; qrCode: string }>>(
      '/auth/mfa/setup'
    );
    return response.data;
  },

  async enableMfa(code: string): Promise<ApiResponse<{ backupCodes: string[] }>> {
    const response = await apiClient.post<ApiResponse<{ backupCodes: string[] }>>(
      '/auth/mfa/enable',
      { code }
    );
    return response.data;
  },

  async disableMfa(code: string): Promise<ApiResponse<void>> {
    const response = await apiClient.post<ApiResponse<void>>(
      '/auth/mfa/disable',
      { code }
    );
    return response.data;
  },

  async generateBackupCodes(): Promise<ApiResponse<{ backupCodes: string[] }>> {
    const response = await apiClient.post<ApiResponse<{ backupCodes: string[] }>>(
      '/auth/mfa/backup-codes'
    );
    return response.data;
  },
};
