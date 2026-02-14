import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, AuthTokens } from '@/types';
import { config } from '@/config';

interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  mfaRequired: boolean;
  mfaSessionToken: string | null;
  isDemoMode: boolean;

  // Actions
  setUser: (user: User) => void;
  setTokens: (tokens: AuthTokens) => void;
  setMfaRequired: (required: boolean, sessionToken?: string) => void;
  login: (user: User, tokens: AuthTokens) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
  enableDemoMode: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      tokens: null,
      isAuthenticated: false,
      isLoading: true,
      mfaRequired: false,
      mfaSessionToken: null,
      isDemoMode: false,

      setUser: (user) => set({ user }),

      setTokens: (tokens) => set({ tokens }),

      setMfaRequired: (required, sessionToken) =>
        set({ mfaRequired: required, mfaSessionToken: sessionToken || null }),

      login: (user, tokens) => set({
        user,
        tokens,
        isAuthenticated: true,
        isLoading: false,
        mfaRequired: false,
        mfaSessionToken: null,
      }),

      logout: () => set({
        user: null,
        tokens: null,
        isAuthenticated: false,
        isLoading: false,
        mfaRequired: false,
        mfaSessionToken: null,
        isDemoMode: false,
      }),

      setLoading: (loading) => set({ isLoading: loading }),

      enableDemoMode: () => {
        const demoUser: User = {
          id: 'demo-user-id',
          email: 'demo@example.com',
          name: 'Demo User',
          role: 'admin',
          tenantId: 'demo-tenant',
          mfaEnabled: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const demoTokens: AuthTokens = {
          accessToken: 'demo-access-token',
          refreshToken: 'demo-refresh-token',
          expiresIn: 3600,
        };

        set({
          user: demoUser,
          tokens: demoTokens,
          isAuthenticated: true,
          isLoading: false,
          mfaRequired: false,
          mfaSessionToken: null,
          isDemoMode: true,
        });
      },
    }),
    {
      name: config.auth.tokenKey,
      partialize: (state) => ({
        user: state.user,
        tokens: state.tokens,
        isAuthenticated: state.isAuthenticated,
        isDemoMode: state.isDemoMode,
      }),
    }
  )
);
