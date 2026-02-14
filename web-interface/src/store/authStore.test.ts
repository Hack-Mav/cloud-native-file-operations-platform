import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from './authStore';
import type { User, AuthTokens } from '@/types';

describe('authStore', () => {
  const mockUser: User = {
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    role: 'user',
    tenantId: 'tenant-1',
    mfaEnabled: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  const mockTokens: AuthTokens = {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresIn: 3600,
  };

  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      tokens: null,
      isAuthenticated: false,
      isLoading: true,
      mfaRequired: false,
      mfaSessionToken: null,
    });
  });

  describe('login', () => {
    it('should set user and tokens on login', () => {
      const { login } = useAuthStore.getState();

      login(mockUser, mockTokens);

      const state = useAuthStore.getState();
      expect(state.user).toEqual(mockUser);
      expect(state.tokens).toEqual(mockTokens);
      expect(state.isAuthenticated).toBe(true);
      expect(state.isLoading).toBe(false);
    });

    it('should clear MFA state on login', () => {
      useAuthStore.setState({
        mfaRequired: true,
        mfaSessionToken: 'session-token',
      });

      const { login } = useAuthStore.getState();
      login(mockUser, mockTokens);

      const state = useAuthStore.getState();
      expect(state.mfaRequired).toBe(false);
      expect(state.mfaSessionToken).toBeNull();
    });
  });

  describe('logout', () => {
    it('should clear all auth state on logout', () => {
      const { login, logout } = useAuthStore.getState();

      login(mockUser, mockTokens);
      logout();

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.tokens).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.mfaRequired).toBe(false);
    });
  });

  describe('setUser', () => {
    it('should update user', () => {
      const { setUser } = useAuthStore.getState();

      setUser(mockUser);

      const state = useAuthStore.getState();
      expect(state.user).toEqual(mockUser);
    });
  });

  describe('setMfaRequired', () => {
    it('should set MFA required state', () => {
      const { setMfaRequired } = useAuthStore.getState();

      setMfaRequired(true, 'session-token');

      const state = useAuthStore.getState();
      expect(state.mfaRequired).toBe(true);
      expect(state.mfaSessionToken).toBe('session-token');
    });

    it('should clear MFA session token when not required', () => {
      useAuthStore.setState({
        mfaRequired: true,
        mfaSessionToken: 'session-token',
      });

      const { setMfaRequired } = useAuthStore.getState();
      setMfaRequired(false);

      const state = useAuthStore.getState();
      expect(state.mfaRequired).toBe(false);
      expect(state.mfaSessionToken).toBeNull();
    });
  });

  describe('setLoading', () => {
    it('should set loading state', () => {
      const { setLoading } = useAuthStore.getState();

      setLoading(false);

      expect(useAuthStore.getState().isLoading).toBe(false);

      setLoading(true);

      expect(useAuthStore.getState().isLoading).toBe(true);
    });
  });
});
