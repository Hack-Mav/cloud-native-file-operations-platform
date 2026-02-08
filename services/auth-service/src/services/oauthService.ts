import axios from 'axios';
import { createError } from '../middleware/errors';
import { OAuthProvider, OAuthTokenResponse, OAuthUserInfo } from '../models/User';
import { config } from '../config/config';

export class OAuthService {
  private providers: Map<string, OAuthProvider> = new Map();

  constructor() {
    this.initializeProviders();
  }

  private initializeProviders(): void {
    // Google OAuth2 provider
    if (config.oauth.google.clientId) {
      this.providers.set('google', {
        id: 'google',
        name: 'Google',
        clientId: config.oauth.google.clientId,
        clientSecret: config.oauth.google.clientSecret,
        redirectUri: config.oauth.google.redirectUri,
        scope: ['openid', 'email', 'profile'],
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo'
      });
    }

    // Microsoft OAuth2 provider
    if (config.oauth.microsoft.clientId) {
      this.providers.set('microsoft', {
        id: 'microsoft',
        name: 'Microsoft',
        clientId: config.oauth.microsoft.clientId,
        clientSecret: config.oauth.microsoft.clientSecret,
        redirectUri: config.oauth.microsoft.redirectUri,
        scope: ['openid', 'email', 'profile'],
        authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
        tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        userInfoUrl: 'https://graph.microsoft.com/v1.0/me'
      });
    }
  }

  /**
   * Get authorization URL for OAuth provider
   */
  getAuthorizationUrl(providerId: string, state?: string): string {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw createError('OAuth provider not found', 404, 'OAUTH_PROVIDER_NOT_FOUND');
    }

    const params = new URLSearchParams({
      client_id: provider.clientId,
      redirect_uri: provider.redirectUri,
      response_type: 'code',
      scope: provider.scope.join(' '),
      access_type: 'offline',
      prompt: 'consent'
    });

    if (state) {
      params.append('state', state);
    }

    return `${provider.authUrl}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(providerId: string, code: string): Promise<OAuthTokenResponse> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw createError('OAuth provider not found', 404, 'OAUTH_PROVIDER_NOT_FOUND');
    }

    try {
      const response = await axios.post(provider.tokenUrl, {
        client_id: provider.clientId,
        client_secret: provider.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: provider.redirectUri
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      const tokenData = response.data;
      
      return {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresIn: tokenData.expires_in,
        tokenType: tokenData.token_type || 'Bearer'
      };
    } catch (error: any) {
      console.error('OAuth token exchange error:', error.response?.data || error.message);
      throw createError('Failed to exchange authorization code', 400, 'OAUTH_TOKEN_EXCHANGE_FAILED');
    }
  }

  /**
   * Get user information from OAuth provider
   */
  async getUserInfo(providerId: string, accessToken: string): Promise<OAuthUserInfo> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw createError('OAuth provider not found', 404, 'OAUTH_PROVIDER_NOT_FOUND');
    }

    try {
      const response = await axios.get(provider.userInfoUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      const userData = response.data;
      
      // Normalize user data based on provider
      return this.normalizeUserData(providerId, userData);
    } catch (error: any) {
      console.error('OAuth user info error:', error.response?.data || error.message);
      throw createError('Failed to get user information', 400, 'OAUTH_USER_INFO_FAILED');
    }
  }

  /**
   * Normalize user data from different OAuth providers
   */
  private normalizeUserData(providerId: string, userData: any): OAuthUserInfo {
    switch (providerId) {
      case 'google':
        return {
          id: userData.id,
          email: userData.email,
          name: userData.name,
          picture: userData.picture,
          provider: 'google'
        };
      
      case 'microsoft':
        return {
          id: userData.id,
          email: userData.mail || userData.userPrincipalName,
          name: userData.displayName,
          picture: userData.photo,
          provider: 'microsoft'
        };
      
      default:
        throw createError('Unsupported OAuth provider', 400, 'UNSUPPORTED_OAUTH_PROVIDER');
    }
  }

  /**
   * Get list of available OAuth providers
   */
  getAvailableProviders(): Array<{ id: string; name: string }> {
    return Array.from(this.providers.values()).map(provider => ({
      id: provider.id,
      name: provider.name
    }));
  }

  /**
   * Refresh OAuth access token
   */
  async refreshAccessToken(providerId: string, refreshToken: string): Promise<OAuthTokenResponse> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw createError('OAuth provider not found', 404, 'OAUTH_PROVIDER_NOT_FOUND');
    }

    try {
      const response = await axios.post(provider.tokenUrl, {
        client_id: provider.clientId,
        client_secret: provider.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      const tokenData = response.data;
      
      return {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || refreshToken,
        expiresIn: tokenData.expires_in,
        tokenType: tokenData.token_type || 'Bearer'
      };
    } catch (error: any) {
      console.error('OAuth token refresh error:', error.response?.data || error.message);
      throw createError('Failed to refresh access token', 400, 'OAUTH_TOKEN_REFRESH_FAILED');
    }
  }
}

export const oauthService = new OAuthService();