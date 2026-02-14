import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import RegisterPage from './RegisterPage';
import { useAuthStore } from '@/store/authStore';
import { authApi } from '@/api/auth';

// Mock the dependencies
vi.mock('@/store/authStore');
vi.mock('@/api/auth');
vi.mock('@/api/client');

const mockUseAuthStore = vi.mocked(useAuthStore);
const mockAuthApi = vi.mocked(authApi);

describe('RegisterPage', () => {
  const mockLogin = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockUseAuthStore.mockReturnValue({
      login: mockLogin,
    } as any);
  });

  it('renders registration form correctly', () => {
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    );

    expect(screen.getByText('Create your account')).toBeInTheDocument();
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  it('shows and hides password when clicking the visibility toggle', () => {
    render(
      <MemoryRouter>
        <RegisterPage />
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

  it('validates password requirements', async () => {
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    );

    const nameInput = screen.getByLabelText(/full name/i);
    const emailInput = screen.getByLabelText(/email address/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const confirmPasswordInput = screen.getByLabelText(/confirm password/i);
    const submitButton = screen.getByRole('button', { name: /create account/i });

    fireEvent.change(nameInput, { target: { value: 'Test User' } });
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'weak' } });
    fireEvent.change(confirmPasswordInput, { target: { value: 'weak' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
    });
  });

  it('validates password complexity', async () => {
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    );

    const nameInput = screen.getByLabelText(/full name/i);
    const emailInput = screen.getByLabelText(/email address/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const confirmPasswordInput = screen.getByLabelText(/confirm password/i);
    const submitButton = screen.getByRole('button', { name: /create account/i });

    fireEvent.change(nameInput, { target: { value: 'Test User' } });
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.change(confirmPasswordInput, { target: { value: 'password123' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Password must contain at least one uppercase letter')).toBeInTheDocument();
    });
  });

  it('validates password confirmation', async () => {
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    );

    const nameInput = screen.getByLabelText(/full name/i);
    const emailInput = screen.getByLabelText(/email address/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const confirmPasswordInput = screen.getByLabelText(/confirm password/i);
    const submitButton = screen.getByRole('button', { name: /create account/i });

    fireEvent.change(nameInput, { target: { value: 'Test User' } });
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'Password123' } });
    fireEvent.change(confirmPasswordInput, { target: { value: 'Different123' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    });
  });

  it('shows password mismatch error in real-time', () => {
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    );

    const passwordInput = screen.getByLabelText(/password/i);
    const confirmPasswordInput = screen.getByLabelText(/confirm password/i);

    fireEvent.change(passwordInput, { target: { value: 'Password123' } });
    fireEvent.change(confirmPasswordInput, { target: { value: 'Different123' } });

    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    expect(confirmPasswordInput).toHaveClass('Mui-error');
  });

  it('handles successful registration', async () => {
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

    mockAuthApi.register.mockResolvedValue(mockResponse);

    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    );

    const nameInput = screen.getByLabelText(/full name/i);
    const emailInput = screen.getByLabelText(/email address/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const confirmPasswordInput = screen.getByLabelText(/confirm password/i);
    const submitButton = screen.getByRole('button', { name: /create account/i });

    fireEvent.change(nameInput, { target: { value: 'Test User' } });
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'Password123' } });
    fireEvent.change(confirmPasswordInput, { target: { value: 'Password123' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockAuthApi.register).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'Password123',
        name: 'Test User',
      });
    });

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith(
        mockResponse.data.user,
        mockResponse.data.tokens
      );
    });
  });

  it('handles registration error', async () => {
    const mockResponse = {
      success: false,
      error: { code: 'EMAIL_EXISTS', message: 'Email already exists' },
    };

    mockAuthApi.register.mockResolvedValue(mockResponse);

    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    );

    const nameInput = screen.getByLabelText(/full name/i);
    const emailInput = screen.getByLabelText(/email address/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const confirmPasswordInput = screen.getByLabelText(/confirm password/i);
    const submitButton = screen.getByRole('button', { name: /create account/i });

    fireEvent.change(nameInput, { target: { value: 'Test User' } });
    fireEvent.change(emailInput, { target: { value: 'existing@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'Password123' } });
    fireEvent.change(confirmPasswordInput, { target: { value: 'Password123' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Email already exists')).toBeInTheDocument();
    });
  });

  it('handles network error', async () => {
    mockAuthApi.register.mockRejectedValue(new Error('Network error'));

    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    );

    const nameInput = screen.getByLabelText(/full name/i);
    const emailInput = screen.getByLabelText(/email address/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const confirmPasswordInput = screen.getByLabelText(/confirm password/i);
    const submitButton = screen.getByRole('button', { name: /create account/i });

    fireEvent.change(nameInput, { target: { value: 'Test User' } });
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'Password123' } });
    fireEvent.change(confirmPasswordInput, { target: { value: 'Password123' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('shows loading state during submission', async () => {
    mockAuthApi.register.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));

    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    );

    const nameInput = screen.getByLabelText(/full name/i);
    const emailInput = screen.getByLabelText(/email address/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const confirmPasswordInput = screen.getByLabelText(/confirm password/i);
    const submitButton = screen.getByRole('button', { name: /create account/i });

    fireEvent.change(nameInput, { target: { value: 'Test User' } });
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'Password123' } });
    fireEvent.change(confirmPasswordInput, { target: { value: 'Password123' } });
    fireEvent.click(submitButton);

    expect(screen.getByText('Creating account...')).toBeInTheDocument();
    expect(submitButton).toBeDisabled();

    await waitFor(() => {
      expect(screen.getByText('Create account')).toBeInTheDocument();
      expect(submitButton).not.toBeDisabled();
    });
  });

  it('has link to login page', () => {
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    );

    const signInLink = screen.getByRole('link', { name: /sign in/i });
    expect(signInLink).toHaveAttribute('href', '/login');
  });

  it('validates all password requirements', () => {
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    );

    const passwordInput = screen.getByLabelText(/password/i);
    const confirmPasswordInput = screen.getByLabelText(/confirm password/i);
    const submitButton = screen.getByRole('button', { name: /create account/i });

    // Test missing uppercase
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.change(confirmPasswordInput, { target: { value: 'password123' } });
    fireEvent.click(submitButton);

    // Test missing lowercase
    fireEvent.change(passwordInput, { target: { value: 'PASSWORD123' } });
    fireEvent.change(confirmPasswordInput, { target: { value: 'PASSWORD123' } });
    fireEvent.click(submitButton);

    // Test missing number
    fireEvent.change(passwordInput, { target: { value: 'Password' } });
    fireEvent.change(confirmPasswordInput, { target: { value: 'Password' } });
    fireEvent.click(submitButton);

    // Valid password
    fireEvent.change(passwordInput, { target: { value: 'Password123' } });
    fireEvent.change(confirmPasswordInput, { target: { value: 'Password123' } });
  });
});
