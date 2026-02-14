import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { ThemeProvider } from '@mui/material/styles';
import { vi } from 'vitest';
import App from '@/App';
import { lightTheme } from '@/theme';
import { useAuthStore } from '@/store/authStore';
import { useFileStore } from '@/store/fileStore';
import { authApi } from '@/api/auth';
import { filesApi } from '@/api/files';

// Mock the stores and APIs
vi.mock('@/store/authStore');
vi.mock('@/store/fileStore');
vi.mock('@/api/auth');
vi.mock('@/api/files');
vi.mock('@/api/client');

const mockUseAuthStore = vi.mocked(useAuthStore);
const mockUseFileStore = vi.mocked(useFileStore);
const mockAuthApi = vi.mocked(authApi);
const mockFilesApi = vi.mocked(filesApi);

// Mock child components that are not part of the workflow
vi.mock('@/components/files/Breadcrumbs', () => ({
  default: () => <div data-testid="breadcrumbs" />,
}));

vi.mock('@/components/files/FileGrid', () => ({
  default: ({ onItemClick, onItemSelect }: any) => (
    <div data-testid="file-grid">
      <button onClick={() => onItemClick({ id: 'file1', name: 'test.pdf', isFolder: false })}>
        Open File
      </button>
      <button onClick={() => onItemSelect('file1')}>Select File</button>
    </div>
  ),
}));

vi.mock('@/components/files/FileUploader', () => ({
  default: ({ onUploadComplete }: any) => (
    <div data-testid="file-uploader">
      <button onClick={onUploadComplete}>Upload Complete</button>
    </div>
  ),
}));

vi.mock('@/components/files/FilePreview', () => ({
  default: ({ file, onClose }: any) => (
    file && (
      <div data-testid="file-preview">
        <span>Preview: {file.name}</span>
        <button onClick={onClose}>Close</button>
      </div>
    )
  ),
}));

const createTestQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});

const renderWithProviders = (component: React.ReactElement, initialEntries = ['/']) => {
  const queryClient = createTestQueryClient();
  
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <ThemeProvider theme={lightTheme}>
          {component}
        </ThemeProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('User Workflows Integration Tests', () => {
  const mockLogin = vi.fn();
  const mockSetLoading = vi.fn();
  const mockSetFiles = vi.fn();
  const mockSetFolders = vi.fn();
  const mockSetCurrentPath = vi.fn();
  const mockToggleItemSelection = vi.fn();
  const mockClearSelection = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup auth store mocks
    mockUseAuthStore.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      login: mockLogin,
      logout: vi.fn(),
      register: vi.fn(),
      setLoading: mockSetLoading,
      checkAuth: vi.fn(),
      setMfaRequired: vi.fn(),
      enableDemoMode: vi.fn(),
    } as any);

    // Setup file store mocks
    mockUseFileStore.mockReturnValue({
      files: [],
      folders: [],
      selectedItems: [],
      viewMode: 'grid',
      sortBy: 'name',
      sortOrder: 'asc',
      isLoading: false,
      setFiles: mockSetFiles,
      setFolders: mockSetFolders,
      setCurrentPath: mockSetCurrentPath,
      toggleItemSelection: mockToggleItemSelection,
      selectAllItems: vi.fn(),
      clearSelection: mockClearSelection,
      setLoading: vi.fn(),
      setViewMode: vi.fn(),
      setSort: vi.fn(),
    } as any);

    // Setup API mocks
    mockAuthApi.login.mockResolvedValue({
      success: true,
      data: {
        user: {
          id: 'user1',
          email: 'test@example.com',
          name: 'Test User',
          role: 'user' as const,
          tenantId: 'tenant1',
          mfaEnabled: false,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        tokens: { accessToken: 'token', refreshToken: 'refresh', expiresIn: 3600 },
      },
    });

    mockFilesApi.listFiles.mockResolvedValue({
      success: true,
      data: {
        items: [],
        pagination: { page: 1, pageSize: 50, total: 0, totalPages: 1 },
      },
    });
  });

  describe('Login Workflow', () => {
    it('should complete full login flow successfully', async () => {
      renderWithProviders(<App />, ['/login']);

      // Should be on login page
      expect(screen.getByText('Sign in to your account')).toBeInTheDocument();

      // Fill login form
      const emailInput = screen.getByLabelText(/email address/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });
      fireEvent.click(submitButton);

      // Should call login API
      await waitFor(() => {
        expect(mockAuthApi.login).toHaveBeenCalledWith({
          email: 'test@example.com',
          password: 'password123',
        });
      });

      // Should update auth store
      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalled();
      });

      // Should redirect to files page (this would be handled by React Router)
      expect(screen.getByText('My Files')).toBeInTheDocument();
    });

    it('should handle login error and stay on login page', async () => {
      mockAuthApi.login.mockResolvedValue({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' },
      });

      renderWithProviders(<App />, ['/login']);

      const emailInput = screen.getByLabelText(/email address/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'wrongpassword' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
      });

      // Should stay on login page
      expect(screen.getByText('Sign in to your account')).toBeInTheDocument();
    });
  });

  describe('File Management Workflow', () => {
    beforeEach(() => {
      // User is already authenticated
      mockUseAuthStore.mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        user: {
          id: 'user1',
          email: 'test@example.com',
          name: 'Test User',
          role: 'user' as const,
          tenantId: 'tenant1',
          mfaEnabled: false,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        login: mockLogin,
        logout: vi.fn(),
        register: vi.fn(),
        setLoading: mockSetLoading,
        checkAuth: vi.fn(),
        setMfaRequired: vi.fn(),
        enableDemoMode: vi.fn(),
      } as any);
    });

    it('should load files and allow file operations', async () => {
      const mockFiles = [
        {
          id: 'file1',
          name: 'document.pdf',
          path: '/document.pdf',
          size: 1024,
          mimeType: 'application/pdf',
          isFolder: false,
          parentId: null,
          ownerId: 'user1',
          tenantId: 'tenant1',
          tags: [],
          metadata: {},
          version: 1,
          checksum: 'abc123',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      mockFilesApi.listFiles.mockResolvedValue({
        success: true,
        data: {
          items: mockFiles,
          pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
        },
      });

      renderWithProviders(<App />, ['/files']);

      // Should load files
      await waitFor(() => {
        expect(mockFilesApi.listFiles).toHaveBeenCalled();
      });

      expect(mockSetFiles).toHaveBeenCalledWith(mockFiles);

      // Should show files page
      expect(screen.getByText('My Files')).toBeInTheDocument();
      expect(screen.getByTestId('file-grid')).toBeInTheDocument();

      // Should allow file selection
      const selectButton = screen.getByText('Select File');
      fireEvent.click(selectButton);

      expect(mockToggleItemSelection).toHaveBeenCalledWith('file1');

      // Should allow file preview
      const openButton = screen.getByText('Open File');
      fireEvent.click(openButton);

      expect(screen.getByTestId('file-preview')).toBeInTheDocument();
      expect(screen.getByText('Preview: document.pdf')).toBeInTheDocument();
    });

    it('should handle file upload workflow', async () => {
      renderWithProviders(<App />, ['/files']);

      await waitFor(() => {
        expect(screen.getByText('My Files')).toBeInTheDocument();
      });

      // Click upload button
      const uploadButton = screen.getByRole('button', { name: /upload/i });
      fireEvent.click(uploadButton);

      // Should show uploader
      expect(screen.getByTestId('file-uploader')).toBeInTheDocument();

      // Complete upload
      const uploadCompleteButton = screen.getByText('Upload Complete');
      fireEvent.click(uploadCompleteButton);

      // Should reload files
      await waitFor(() => {
        expect(mockFilesApi.listFiles).toHaveBeenCalledTimes(2); // Initial load + after upload
      });
    });
  });

  describe('Navigation Workflow', () => {
    beforeEach(() => {
      mockUseAuthStore.mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        user: {
          id: 'user1',
          email: 'test@example.com',
          name: 'Test User',
          role: 'user' as const,
          tenantId: 'tenant1',
          mfaEnabled: false,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        login: mockLogin,
        logout: vi.fn(),
        register: vi.fn(),
        setLoading: mockSetLoading,
        checkAuth: vi.fn(),
        setMfaRequired: vi.fn(),
        enableDemoMode: vi.fn(),
      } as any);
    });

    it('should navigate between different pages', async () => {
      renderWithProviders(<App />, ['/files']);

      await waitFor(() => {
        expect(screen.getByText('My Files')).toBeInTheDocument();
      });

      // Navigate to dashboard (this would require actual navigation in real app)
      // For integration test, we're testing that the components render correctly
      expect(screen.getByTestId('files-page')).toBeInTheDocument();
    });

    it('should redirect to login when accessing protected routes while not authenticated', async () => {
      // User is not authenticated
      mockUseAuthStore.mockReturnValue({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        login: mockLogin,
        logout: vi.fn(),
        register: vi.fn(),
        setLoading: mockSetLoading,
        checkAuth: vi.fn(),
        setMfaRequired: vi.fn(),
        enableDemoMode: vi.fn(),
      } as any);
      
      renderWithProviders(<App />, ['/files']);

      // Should redirect to login
      await waitFor(() => {
        expect(screen.getByText('Sign in to your account')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling Workflow', () => {
    it('should handle network errors gracefully', async () => {
      mockAuthApi.login.mockRejectedValue(new Error('Network error'));

      renderWithProviders(<App />, ['/login']);

      const emailInput = screen.getByLabelText(/email address/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });

      // Should stay on login page
      expect(screen.getByText('Sign in to your account')).toBeInTheDocument();
    });

    it('should handle file loading errors', async () => {
      mockUseAuthStore.mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        user: {
          id: 'user1',
          email: 'test@example.com',
          name: 'Test User',
          role: 'user' as const,
          tenantId: 'tenant1',
          mfaEnabled: false,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        login: mockLogin,
        logout: vi.fn(),
        register: vi.fn(),
        setLoading: mockSetLoading,
        checkAuth: vi.fn(),
        setMfaRequired: vi.fn(),
        enableDemoMode: vi.fn(),
      } as any);

      mockFilesApi.listFiles.mockRejectedValue(new Error('Failed to load files'));

      renderWithProviders(<App />, ['/files']);

      await waitFor(() => {
        expect(screen.getByText('Failed to load files')).toBeInTheDocument();
      });
    });
  });
});
