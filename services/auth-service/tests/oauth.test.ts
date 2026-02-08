import { OAuthService } from '../src/services/oauthService';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock the config module
jest.mock('../src/config/config', () => ({
  config: {
    oauth: {
      google: {
        clientId: 'test-google-client-id',
        clientSecret: 'test-google-client-secret',
        redirectUri: 'http://localhost:3000/auth/oauth/google/callback'
      },
      microsoft: {
        clientId: 'test-microsoft-client-id',
        clientSecret: 'test-microsoft-client-secret',
        redirectUri: 'http://localhost:3000/auth/oauth/microsoft/callback'
      }
    }
  }
}));

describe('OAuth Functionality', () => {
  let oauthService: OAuthService;

  beforeEach(() => {
    oauthService = new OAuthService();
    jest.clearAllMocks();
  });

  describe('Authorization URL Generation', () => {
    it('should generate Google OAuth authorization URL', () => {
      const authUrl = oauthService.getAuthorizationUrl('google', 'test-state');
      
      expect(authUrl).toContain('https://accounts.google.com/o/oauth2/v2/auth');
      expect(authUrl).toContain('client_id=test-google-client-id');
      expect(authUrl).toContain('state=test-state');
      expect(authUrl).toContain('scope=openid+email+profile');
    });

    it('should throw error for unknown provider', () => {
      expect(() => {
        oauthService.getAuthorizationUrl('unknown-provider');
      }).toThrow('OAuth provider not found');
    });
  });

  describe('Token Exchange', () => {
    it('should exchange authorization code for tokens', async () => {

      const mockTokenResponse = {
        data: {
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
          expires_in: 3600,
          token_type: 'Bearer'
        }
      };

      mockedAxios.post.mockResolvedValue(mockTokenResponse);

      const result = await oauthService.exchangeCodeForToken('google', 'test-auth-code');

      expect(result).toEqual({
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresIn: 3600,
        tokenType: 'Bearer'
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/token',
        expect.objectContaining({
          client_id: 'test-google-client-id',
          client_secret: 'test-google-client-secret',
          code: 'test-auth-code',
          grant_type: 'authorization_code'
        }),
        expect.any(Object)
      );
    });

    it('should handle token exchange errors', async () => {
      mockedAxios.post.mockRejectedValue(new Error('Token exchange failed'));

      await expect(
        oauthService.exchangeCodeForToken('google', 'invalid-code')
      ).rejects.toThrow('Failed to exchange authorization code');
    });
  });

  describe('User Info Retrieval', () => {
    it('should get Google user info', async () => {

      const mockUserResponse = {
        data: {
          id: 'google-user-id',
          email: 'user@gmail.com',
          name: 'Test User',
          picture: 'https://example.com/avatar.jpg'
        }
      };

      mockedAxios.get.mockResolvedValue(mockUserResponse);

      const result = await oauthService.getUserInfo('google', 'test-access-token');

      expect(result).toEqual({
        id: 'google-user-id',
        email: 'user@gmail.com',
        name: 'Test User',
        picture: 'https://example.com/avatar.jpg',
        provider: 'google'
      });

      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://www.googleapis.com/oauth2/v2/userinfo',
        {
          headers: {
            Authorization: 'Bearer test-access-token'
          }
        }
      );
    });

    it('should handle user info retrieval errors', async () => {
      mockedAxios.get.mockRejectedValue(new Error('User info failed'));

      await expect(
        oauthService.getUserInfo('google', 'invalid-token')
      ).rejects.toThrow('Failed to get user information');
    });
  });

  describe('Available Providers', () => {
    it('should return available OAuth providers', () => {
      const providers = oauthService.getAvailableProviders();

      expect(providers).toEqual(
        expect.arrayContaining([
          { id: 'google', name: 'Google' },
          { id: 'microsoft', name: 'Microsoft' }
        ])
      );
    });
  });
});