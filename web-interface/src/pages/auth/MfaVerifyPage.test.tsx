import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import MfaVerifyPage from './MfaVerifyPage';
import { useAuthStore } from '@/store/authStore';
import { authApi } from '@/api/auth';

// Mock the dependencies
vi.mock('@/store/authStore');
vi.mock('@/api/auth');
vi.mock('@/api/client');

const mockUseAuthStore = vi.mocked(useAuthStore);
const mockAuthApi = vi.mocked(authApi);

describe('MfaVerifyPage', () => {
  const mockLogin = vi.fn();
  const mockSetMfaRequired = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockUseAuthStore.mockReturnValue({
      mfaRequired: true,
      mfaSessionToken: 'session-token',
      login: mockLogin,
      setMfaRequired: mockSetMfaRequired,
    } as any);
  });

  it('renders MFA verification form correctly', () => {
    render(
      <MemoryRouter>
        <MfaVerifyPage />
      </MemoryRouter>
    );

    expect(screen.getByText('Two-Factor Authentication')).toBeInTheDocument();
    expect(screen.getByText('Enter the 6-digit code from your authenticator app')).toBeInTheDocument();
    
    // Should have 6 input fields for the code
    const codeInputs = screen.getAllByRole('textbox');
    expect(codeInputs).toHaveLength(6);
    
    expect(screen.getByRole('button', { name: /verify/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('redirects to login if MFA is not required', () => {
    mockUseAuthStore.mockReturnValue({
      mfaRequired: false,
      mfaSessionToken: null,
      login: mockLogin,
      setMfaRequired: mockSetMfaRequired,
    } as any);

    render(
      <MemoryRouter>
        <MfaVerifyPage />
      </MemoryRouter>
    );

    // Should redirect to login page
    expect(window.location.pathname).toBe('/login');
  });

  it('handles single digit input correctly', async () => {
    render(
      <MemoryRouter>
        <MfaVerifyPage />
      </MemoryRouter>
    );

    const codeInputs = screen.getAllByRole('textbox');
    
    // Type first digit
    fireEvent.change(codeInputs[0], { target: { value: '1' } });
    
    expect(codeInputs[0]).toHaveValue('1');
    
    // Should focus on next input
    await waitFor(() => {
      expect(document.activeElement).toBe(codeInputs[1]);
    });
  });

  it('handles paste of full code', async () => {
    render(
      <MemoryRouter>
        <MfaVerifyPage />
      </MemoryRouter>
    );

    const codeInputs = screen.getAllByRole('textbox');
    
    // Paste full code into first input
    fireEvent.change(codeInputs[0], { target: { value: '123456' } });
    
    await waitFor(() => {
      expect(codeInputs[0]).toHaveValue('1');
      expect(codeInputs[1]).toHaveValue('2');
      expect(codeInputs[2]).toHaveValue('3');
      expect(codeInputs[3]).toHaveValue('4');
      expect(codeInputs[4]).toHaveValue('5');
      expect(codeInputs[5]).toHaveValue('6');
    });
  });

  it('handles backspace navigation', async () => {
    render(
      <MemoryRouter>
        <MfaVerifyPage />
      </MemoryRouter>
    );

    const codeInputs = screen.getAllByRole('textbox');
    
    // Type first digit
    fireEvent.change(codeInputs[0], { target: { value: '1' } });
    
    // Move to second input
    codeInputs[1].focus();
    
    // Press backspace on empty second input
    fireEvent.keyDown(codeInputs[1], { key: 'Backspace' });
    
    // Should focus back to first input
    await waitFor(() => {
      expect(document.activeElement).toBe(codeInputs[0]);
    });
  });

  it('filters non-digit characters', () => {
    render(
      <MemoryRouter>
        <MfaVerifyPage />
      </MemoryRouter>
    );

    const codeInputs = screen.getAllByRole('textbox');
    
    // Type non-digit characters
    fireEvent.change(codeInputs[0], { target: { value: 'abc' } });
    
    expect(codeInputs[0]).toHaveValue('');
  });

  it('validates complete code before submission', async () => {
    render(
      <MemoryRouter>
        <MfaVerifyPage />
      </MemoryRouter>
    );

    const codeInputs = screen.getAllByRole('textbox');
    const submitButton = screen.getByRole('button', { name: /verify/i });
    
    // Type only 3 digits
    fireEvent.change(codeInputs[0], { target: { value: '1' } });
    fireEvent.change(codeInputs[1], { target: { value: '2' } });
    fireEvent.change(codeInputs[2], { target: { value: '3' } });
    
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText('Please enter complete 6-digit code')).toBeInTheDocument();
    });
  });

  it('handles successful MFA verification', async () => {
    const mockResponse = {
      success: true,
      data: {
        user: { 
          id: '1', 
          email: 'test@example.com', 
          name: 'Test User',
          role: 'user' as const,
          tenantId: 'tenant-1',
          mfaEnabled: true,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        tokens: { accessToken: 'token', refreshToken: 'refresh', expiresIn: 3600 },
      },
    };

    mockAuthApi.verifyMfa.mockResolvedValue(mockResponse);

    render(
      <MemoryRouter>
        <MfaVerifyPage />
      </MemoryRouter>
    );

    const codeInputs = screen.getAllByRole('textbox');
    const submitButton = screen.getByRole('button', { name: /verify/i });
    
    // Enter full code
    fireEvent.change(codeInputs[0], { target: { value: '123456' } });
    
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockAuthApi.verifyMfa).toHaveBeenCalledWith('session-token', '123456');
    });

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith(
        mockResponse.data.user,
        mockResponse.data.tokens
      );
    });

    expect(mockSetMfaRequired).toHaveBeenCalledWith(false);
  });

  it('handles MFA verification error', async () => {
    const mockResponse = {
      success: false,
      error: { code: 'INVALID_CODE', message: 'Invalid verification code' },
    };

    mockAuthApi.verifyMfa.mockResolvedValue(mockResponse);

    render(
      <MemoryRouter>
        <MfaVerifyPage />
      </MemoryRouter>
    );

    const codeInputs = screen.getAllByRole('textbox');
    const submitButton = screen.getByRole('button', { name: /verify/i });
    
    // Enter full code
    fireEvent.change(codeInputs[0], { target: { value: '123456' } });
    
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Invalid verification code')).toBeInTheDocument();
    });

    // Code should be cleared and first input focused
    await waitFor(() => {
      expect(codeInputs[0]).toHaveValue('');
      expect(codeInputs[1]).toHaveValue('');
      expect(codeInputs[2]).toHaveValue('');
      expect(codeInputs[3]).toHaveValue('');
      expect(codeInputs[4]).toHaveValue('');
      expect(codeInputs[5]).toHaveValue('');
    });
  });

  it('handles network error', async () => {
    mockAuthApi.verifyMfa.mockRejectedValue(new Error('Network error'));

    render(
      <MemoryRouter>
        <MfaVerifyPage />
      </MemoryRouter>
    );

    const codeInputs = screen.getAllByRole('textbox');
    const submitButton = screen.getByRole('button', { name: /verify/i });
    
    // Enter full code
    fireEvent.change(codeInputs[0], { target: { value: '123456' } });
    
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('shows loading state during verification', async () => {
    mockAuthApi.verifyMfa.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));

    render(
      <MemoryRouter>
        <MfaVerifyPage />
      </MemoryRouter>
    );

    const codeInputs = screen.getAllByRole('textbox');
    const submitButton = screen.getByRole('button', { name: /verify/i });
    
    // Enter full code
    fireEvent.change(codeInputs[0], { target: { value: '123456' } });
    
    fireEvent.click(submitButton);

    expect(screen.getByText('Verifying...')).toBeInTheDocument();
    expect(submitButton).toBeDisabled();

    await waitFor(() => {
      expect(screen.getByText('Verify')).toBeInTheDocument();
      expect(submitButton).not.toBeDisabled();
    });
  });

  it('disables submit button when code is incomplete', () => {
    render(
      <MemoryRouter>
        <MfaVerifyPage />
      </MemoryRouter>
    );

    const codeInputs = screen.getAllByRole('textbox');
    const submitButton = screen.getByRole('button', { name: /verify/i });
    
    // Initially should be disabled
    expect(submitButton).toBeDisabled();
    
    // Type one digit
    fireEvent.change(codeInputs[0], { target: { value: '1' } });
    
    // Should still be disabled
    expect(submitButton).toBeDisabled();
    
    // Complete the code
    fireEvent.change(codeInputs[1], { target: { value: '2' } });
    fireEvent.change(codeInputs[2], { target: { value: '3' } });
    fireEvent.change(codeInputs[3], { target: { value: '4' } });
    fireEvent.change(codeInputs[4], { target: { value: '5' } });
    fireEvent.change(codeInputs[5], { target: { value: '6' } });
    
    // Should be enabled now
    expect(submitButton).not.toBeDisabled();
  });

  it('handles cancel button', () => {
    render(
      <MemoryRouter>
        <MfaVerifyPage />
      </MemoryRouter>
    );

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    
    fireEvent.click(cancelButton);

    expect(mockSetMfaRequired).toHaveBeenCalledWith(false);
  });

  it('focuses first input on mount', () => {
    render(
      <MemoryRouter>
        <MfaVerifyPage />
      </MemoryRouter>
    );

    const codeInputs = screen.getAllByRole('textbox');
    
    // First input should be focused
    expect(codeInputs[0]).toHaveFocus();
  });
});
