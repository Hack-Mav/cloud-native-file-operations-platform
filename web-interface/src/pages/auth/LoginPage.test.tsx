import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import LoginPage from './LoginPage';
import { useAuthStore } from '@/store/authStore';
import { authApi } from '@/api/auth';
import { config } from '@/config';

// Mock the dependencies
vi.mock('@/store/authStore');
vi.mock('@/api/auth');
vi.mock('@/api/client');
vi.mock('@/config');

const mockUseAuthStore = vi.mocked(useAuthStore);
const mockAuthApi = vi.mocked(authApi);
const mockConfig = vi.mocked(config);

describe('LoginPage', () => {
  const mockLogin = vi.fn();
  const mockSetMfaRequired = vi.fn();
  const mockEnableDemoMode = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockUseAuthStore.mockReturnValue({
      login: mockLogin,
      setMfaRequired: mockSetMfaRequired,
      enableDemoMode: mockEnableDemoMode,
    } as any);

    mockConfig.demo = { enabled: false };
  });

  it('renders login form correctly', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    expect(screen.getByText('Sign in to your account')).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('shows and hides password when clicking the visibility toggle', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    const passwordInput = screen.getByLabelText(/password/i);
    const visibilityToggle = screen.getByRole('button', { name: /toggle password visibility/i });

    expect(passwordInput).toHaveAttribute('type', 'password');

    fireEvent.click(visibilityToggle);
    expect(passwordInput).toHaveAttribute('type', 'text');

    fireEvent.click(visibilityToggle);
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  it('validates required fields', async () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    const submitButton = screen.getByRole('button', { name: /sign in/i });
    fireEvent.click(submitButton);

    // Check if email field is required
    const emailInput = screen.getByLabelText(/email address/i);
    expect(emailInput).toBeRequired();

    // Check if password field is required
    const passwordInput = screen.getByLabelText(/password/i);
    expect(passwordInput).toBeRequired();
  });

  it('handles successful login without MFA', async () => {
    const mockResponse = {
      success: true,
      data: {
        user: { 
          id: '1', 
          email: 'test@example.com', 
          name: 'Test User',
          role: 'user' as const,
          tenantId: 'tenant-1',
          mfaEnabled: false,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        tokens: { accessToken: 'token', refreshToken: 'refresh', expiresIn: 3600 },
      },
    };

    mockAuthApi.login.mockResolvedValue(mockResponse);

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    const emailInput = screen.getByLabelText(/email address/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockAuthApi.login).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      });
    });

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith(
        mockResponse.data.user,
        mockResponse.data.tokens
      );
    });
  });

  it('handles login requiring MFA', async () => {
    const mockResponse = {
      success: true,
      data: {
        mfaRequired: true as const,
        sessionToken: 'session-token',
      },
    };

    mockAuthApi.login.mockResolvedValue(mockResponse);

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    const emailInput = screen.getByLabelText(/email address/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockSetMfaRequired).toHaveBeenCalledWith(true, 'session-token');
    });
  });

  it('handles login error', async () => {
    const mockResponse = {
      success: false,
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' },
    };

    mockAuthApi.login.mockResolvedValue(mockResponse);

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    const emailInput = screen.getByLabelText(/email address/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'wrongpassword' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });
  });

  it('handles network error', async () => {
    mockAuthApi.login.mockRejectedValue(new Error('Network error'));

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    const emailInput = screen.getByLabelText(/email address/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('shows loading state during submission', async () => {
    mockAuthApi.login.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    const emailInput = screen.getByLabelText(/email address/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.click(submitButton);

    expect(screen.getByText('Signing in...')).toBeInTheDocument();
    expect(submitButton).toBeDisabled();

    await waitFor(() => {
      expect(screen.getByText('Sign in')).toBeInTheDocument();
      expect(submitButton).not.toBeDisabled();
    });
  });

  it('shows demo mode button when enabled', () => {
    mockConfig.demo = { enabled: true };

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: /try demo mode/i })).toBeInTheDocument();
  });

  it('handles demo mode login', () => {
    mockConfig.demo = { enabled: true };

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    const demoButton = screen.getByRole('button', { name: /try demo mode/i });
    fireEvent.click(demoButton);

    expect(mockEnableDemoMode).toHaveBeenCalled();
  });

  it('has link to registration page', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    const signUpLink = screen.getByRole('link', { name: /sign up/i });
    expect(signUpLink).toHaveAttribute('href', '/register');
  });
});
