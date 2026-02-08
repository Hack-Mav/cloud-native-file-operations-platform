export interface User {
  id?: string;
  email: string;
  name: string;
  passwordHash: string;
  roles: string[];
  preferences: {
    notifications: {
      email: boolean;
      push: boolean;
      sms: boolean;
    };
    ui: {
      theme: string;
      language: string;
    };
  };
  mfa: {
    enabled: boolean;
    secret?: string;
    backupCodes?: string[];
    lastUsedCode?: string;
    enforced?: boolean; // Admin can enforce MFA for specific users
    enforcedAt?: Date;
  };
  createdAt: Date;
  lastLoginAt?: Date;
  status: 'active' | 'inactive' | 'suspended' | 'pending';
  emailVerified: boolean;
  loginAttempts: number;
  lockoutUntil?: Date;
}

export interface CreateUserRequest {
  email: string;
  name: string;
  password: string;
  roles?: string[];
}

export interface LoginRequest {
  email: string;
  password: string;
  mfaCode?: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface MFASetupResponse {
  secret: string;
  qrCode: string;
  backupCodes: string[];
}

export interface OAuthProvider {
  id: string;
  name: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string[];
  authUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
}

export interface OAuthTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  tokenType: string;
}

export interface OAuthUserInfo {
  id: string;
  email: string;
  name: string;
  picture?: string;
  provider: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export const DEFAULT_USER_PREFERENCES = {
  notifications: {
    email: true,
    push: true,
    sms: false
  },
  ui: {
    theme: 'light',
    language: 'en'
  }
};

export const USER_ROLES = {
  ADMIN: 'admin',
  USER: 'user',
  VIEWER: 'viewer'
} as const;

export type UserRole = typeof USER_ROLES[keyof typeof USER_ROLES];