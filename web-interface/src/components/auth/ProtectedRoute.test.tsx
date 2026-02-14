import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@/test/utils';
import { useAuthStore } from '@/store/authStore';
import ProtectedRoute from './ProtectedRoute';

describe('ProtectedRoute', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      tokens: null,
      isAuthenticated: false,
      isLoading: false,
    });
  });

  it('should redirect to login when not authenticated', () => {
    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('should render children when authenticated', () => {
    useAuthStore.setState({
      user: {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'user',
        tenantId: 'tenant-1',
        mfaEnabled: false,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
      tokens: {
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresIn: 3600,
      },
      isAuthenticated: true,
      isLoading: false,
    });

    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('should check required role', () => {
    useAuthStore.setState({
      user: {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'user',
        tenantId: 'tenant-1',
        mfaEnabled: false,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
      tokens: {
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresIn: 3600,
      },
      isAuthenticated: true,
      isLoading: false,
    });

    render(
      <ProtectedRoute requiredRole={['admin']}>
        <div>Admin Content</div>
      </ProtectedRoute>
    );

    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
  });
});
