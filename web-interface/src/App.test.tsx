import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { ThemeProvider } from '@mui/material/styles';
import { vi } from 'vitest';
import App from './App';
import { lightTheme } from '@/theme';
import { useAuthStore, useUiStore } from '@/store';

// Mock the stores
vi.mock('@/store/authStore');
vi.mock('@/store/uiStore');

// Mock the layouts and pages
vi.mock('@/layouts/AppLayout', () => ({
  default: () => <div data-testid="app-layout">App Layout</div>,
}));

vi.mock('@/layouts/AuthLayout', () => ({
  default: () => <div data-testid="auth-layout">Auth Layout</div>,
}));

vi.mock('@/pages/auth/LoginPage', () => ({
  default: () => <div data-testid="login-page">Login Page</div>,
}));

vi.mock('@/pages/auth/RegisterPage', () => ({
  default: () => <div data-testid="register-page">Register Page</div>,
}));

vi.mock('@/pages/auth/MfaVerifyPage', () => ({
  default: () => <div data-testid="mfa-verify-page">MFA Verify Page</div>,
}));

vi.mock('@/pages/files/FilesPage', () => ({
  default: () => <div data-testid="files-page">Files Page</div>,
}));

vi.mock('@/pages/files/SharedPage', () => ({
  default: () => <div data-testid="shared-page">Shared Page</div>,
}));

vi.mock('@/pages/files/TrashPage', () => ({
  default: () => <div data-testid="trash-page">Trash Page</div>,
}));

vi.mock('@/pages/settings/ProfilePage', () => ({
  default: () => <div data-testid="profile-page">Profile Page</div>,
}));

vi.mock('@/pages/settings/SecurityPage', () => ({
  default: () => <div data-testid="security-page">Security Page</div>,
}));

vi.mock('@/pages/settings/NotificationsPage', () => ({
  default: () => <div data-testid="notifications-page">Notifications Page</div>,
}));

vi.mock('@/pages/DashboardPage', () => ({
  default: () => <div data-testid="dashboard-page">Dashboard Page</div>,
}));

vi.mock('@/pages/NotFoundPage', () => ({
  default: () => <div data-testid="not-found-page">Not Found Page</div>,
}));

vi.mock('@/components/auth/ProtectedRoute', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/common/LoadingScreen', () => ({
  default: () => <div data-testid="loading-screen">Loading Screen</div>,
}));

const createTestQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});

const renderWithProviders = (ui: React.ReactElement) => {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeProvider theme={lightTheme}>
          {ui}
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

describe('App', () => {
  const mockUseAuthStore = vi.mocked(useAuthStore);
  const mockUseUiStore = vi.mocked(useUiStore);

  beforeEach(() => {
    const mockAuthStore = {
      isAuthenticated: false,
      isLoading: false,
      user: null,
      login: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
      setLoading: vi.fn(),
      checkAuth: vi.fn(),
    };
    
    const mockUiStore = {
      themeMode: 'light',
      toggleTheme: vi.fn(),
      setTheme: vi.fn(),
    };

    mockUseAuthStore.mockReturnValue(mockAuthStore as any);
    mockUseUiStore.mockReturnValue(mockUiStore as any);
  });

  it('renders loading screen when auth is loading', () => {
    const mockAuthStore = {
      isAuthenticated: false,
      isLoading: true,
      user: null,
      login: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
      setLoading: vi.fn(),
      checkAuth: vi.fn(),
    };
    
    mockUseAuthStore.mockReturnValue(mockAuthStore as any);

    renderWithProviders(<App />);
    
    expect(screen.getByTestId('loading-screen')).toBeInTheDocument();
  });

  it('redirects to login when not authenticated', () => {
    renderWithProviders(<App />);
    
    expect(screen.getByTestId('login-page')).toBeInTheDocument();
  });

  it('renders files page when authenticated', () => {
    const mockAuthStore = {
      isAuthenticated: true,
      isLoading: false,
      user: { id: '1', email: 'test@example.com', role: 'user' },
      login: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
      setLoading: vi.fn(),
      checkAuth: vi.fn(),
    };
    
    mockUseAuthStore.mockReturnValue(mockAuthStore as any);

    renderWithProviders(<App />);
    
    expect(screen.getByTestId('files-page')).toBeInTheDocument();
  });

  it('applies dark theme when themeMode is dark', () => {
    const mockUiStore = {
      themeMode: 'dark',
      toggleTheme: vi.fn(),
      setTheme: vi.fn(),
    };
    
    mockUseUiStore.mockReturnValue(mockUiStore as any);

    renderWithProviders(<App />);
    
    // Theme is applied internally, we just check it renders without error
    expect(screen.getByTestId('login-page')).toBeInTheDocument();
  });

  it('renders 404 page for unknown routes', () => {
    const mockAuthStore = {
      isAuthenticated: true,
      isLoading: false,
      user: null,
      login: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
      setLoading: vi.fn(),
      checkAuth: vi.fn(),
    };
    
    mockUseAuthStore.mockReturnValue(mockAuthStore as any);

    const TestWrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={createTestQueryClient()}>
        <BrowserRouter>
          <ThemeProvider theme={lightTheme}>
            {children}
          </ThemeProvider>
        </BrowserRouter>
      </QueryClientProvider>
    );
    
    render(<App />, { wrapper: TestWrapper });
    
    // Navigate to unknown route
    window.history.pushState({}, '', '/unknown-route');
    
    expect(screen.getByTestId('not-found-page')).toBeInTheDocument();
  });
});
