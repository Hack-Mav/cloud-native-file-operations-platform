import { vi } from 'vitest';
import type { User, FileItem, Folder, AuthTokens } from '@/types';

// Mock API responses
export const mockAuthApi = {
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  verifyMfa: vi.fn(),
  refreshToken: vi.fn(),
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
  changePassword: vi.fn(),
  setupMfa: vi.fn(),
  enableMfa: vi.fn(),
  disableMfa: vi.fn(),
  generateBackupCodes: vi.fn(),
};

export const mockFilesApi = {
  listFiles: vi.fn(),
  uploadFile: vi.fn(),
  deleteFile: vi.fn(),
  renameFile: vi.fn(),
  moveFile: vi.fn(),
  copyFile: vi.fn(),
  getFile: vi.fn(),
  getDownloadUrl: vi.fn(),
  shareFile: vi.fn(),
  unshareFile: vi.fn(),
  createFolder: vi.fn(),
  deleteFolder: vi.fn(),
  renameFolder: vi.fn(),
  moveFolder: vi.fn(),
  copyFolder: vi.fn(),
  getFolder: vi.fn(),
  searchFiles: vi.fn(),
  getSharedFiles: vi.fn(),
  getTrashFiles: vi.fn(),
  restoreFile: vi.fn(),
  permanentDeleteFile: vi.fn(),
};

// Mock data
export const mockUsers: User[] = [
  {
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    role: 'user',
    tenantId: 'tenant-1',
    mfaEnabled: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'user-2',
    email: 'admin@example.com',
    name: 'Admin User',
    role: 'admin',
    tenantId: 'tenant-1',
    mfaEnabled: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
];

export const mockFiles: FileItem[] = [
  {
    id: 'file-1',
    name: 'document.pdf',
    path: '/document.pdf',
    size: 1024 * 1024, // 1MB
    mimeType: 'application/pdf',
    isFolder: false,
    parentId: null,
    ownerId: 'user-1',
    tenantId: 'tenant-1',
    tags: ['important', 'work'],
    metadata: { author: 'Test User', created: '2024-01-01' },
    version: 1,
    checksum: 'abc123',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'file-2',
    name: 'image.jpg',
    path: '/image.jpg',
    size: 500 * 1024, // 500KB
    mimeType: 'image/jpeg',
    isFolder: false,
    parentId: null,
    ownerId: 'user-1',
    tenantId: 'tenant-1',
    tags: ['photo'],
    metadata: { dimensions: '1920x1080' },
    version: 1,
    checksum: 'def456',
    createdAt: '2024-01-02T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
  },
  {
    id: 'file-3',
    name: 'notes.txt',
    path: '/notes.txt',
    size: 1024,
    mimeType: 'text/plain',
    isFolder: false,
    parentId: 'folder-1',
    ownerId: 'user-1',
    tenantId: 'tenant-1',
    tags: [],
    metadata: {},
    version: 1,
    checksum: 'ghi789',
    createdAt: '2024-01-03T00:00:00Z',
    updatedAt: '2024-01-03T00:00:00Z',
  },
];

export const mockFolders: Folder[] = [
  {
    id: 'folder-1',
    name: 'Documents',
    path: '/Documents',
    size: 0,
    mimeType: 'folder',
    isFolder: true,
    parentId: null,
    ownerId: 'user-1',
    tenantId: 'tenant-1',
    tags: [],
    metadata: {},
    version: 1,
    checksum: '',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    childCount: 2,
  },
  {
    id: 'folder-2',
    name: 'Images',
    path: '/Images',
    size: 0,
    mimeType: 'folder',
    isFolder: true,
    parentId: null,
    ownerId: 'user-1',
    tenantId: 'tenant-1',
    tags: [],
    metadata: {},
    version: 1,
    checksum: '',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    childCount: 1,
  },
];

export const mockAuthTokens: AuthTokens = {
  accessToken: 'mock-access-token-12345',
  refreshToken: 'mock-refresh-token-67890',
  expiresIn: 3600,
};

// Mock API responses
export const mockApiResponses = {
  loginSuccess: {
    success: true,
    data: {
      user: mockUsers[0],
      tokens: mockAuthTokens,
    },
  },
  loginError: {
    success: false,
    error: {
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password',
    },
  },
  mfaRequired: {
    success: true,
    data: {
      mfaRequired: true,
      sessionToken: 'mock-session-token',
    },
  },
  registerSuccess: {
    success: true,
    data: {
      user: mockUsers[0],
      tokens: mockAuthTokens,
    },
  },
  filesListSuccess: {
    success: true,
    data: {
      items: [...mockFolders, ...mockFiles],
      pagination: {
        page: 1,
        pageSize: 50,
        total: 5,
        totalPages: 1,
      },
    },
  },
  uploadSuccess: {
    success: true,
    data: {
      file: mockFiles[0],
      uploadId: 'upload-123',
    },
  },
  shareSuccess: {
    success: true,
    data: {
      shareId: 'share-123',
      shareUrl: 'https://example.com/share/share-123',
      expiresAt: '2024-12-31T23:59:59Z',
    },
  },
};

// Mock store state
export const mockAuthStoreState = {
  user: mockUsers[0],
  tokens: mockAuthTokens,
  isAuthenticated: true,
  isLoading: false,
  mfaRequired: false,
  mfaSessionToken: null,
};

export const mockFileStoreState = {
  files: mockFiles,
  folders: mockFolders,
  selectedItems: [],
  viewMode: 'grid' as const,
  sortBy: 'name' as const,
  sortOrder: 'asc' as const,
  isLoading: false,
  currentPath: '/',
  currentFolderId: null,
  searchQuery: '',
  filterBy: 'all' as const,
};

// Helper functions to set up mocks
export const setupAuthMocks = () => {
  mockAuthApi.login.mockResolvedValue(mockApiResponses.loginSuccess);
  mockAuthApi.register.mockResolvedValue(mockApiResponses.registerSuccess);
  mockAuthApi.verifyMfa.mockResolvedValue(mockApiResponses.loginSuccess);
  mockAuthApi.refreshToken.mockResolvedValue({
    success: true,
    data: { accessToken: 'new-access-token', expiresIn: 3600 },
  });
  mockAuthApi.getProfile.mockResolvedValue({
    success: true,
    data: mockUsers[0],
  });
};

export const setupFileMocks = () => {
  mockFilesApi.listFiles.mockResolvedValue(mockApiResponses.filesListSuccess);
  mockFilesApi.uploadFile.mockResolvedValue(mockApiResponses.uploadSuccess);
  mockFilesApi.deleteFile.mockResolvedValue({ success: true });
  mockFilesApi.renameFile.mockResolvedValue({ success: true });
  mockFilesApi.moveFile.mockResolvedValue({ success: true });
  mockFilesApi.copyFile.mockResolvedValue({ success: true });
  mockFilesApi.getFile.mockResolvedValue({
    success: true,
    data: mockFiles[0],
  });
  mockFilesApi.getDownloadUrl.mockResolvedValue({
    success: true,
    data: { url: 'https://example.com/download/file-1' },
  });
  mockFilesApi.shareFile.mockResolvedValue(mockApiResponses.shareSuccess);
  mockFilesApi.createFolder.mockResolvedValue({
    success: true,
    data: mockFolders[0],
  });
  mockFilesApi.searchFiles.mockResolvedValue(mockApiResponses.filesListSuccess);
};

export const setupErrorMocks = () => {
  mockAuthApi.login.mockRejectedValue(new Error('Network error'));
  mockFilesApi.listFiles.mockRejectedValue(new Error('Failed to load files'));
  mockFilesApi.uploadFile.mockRejectedValue(new Error('Upload failed'));
};

// Reset all mocks
export const resetAllMocks = () => {
  vi.clearAllMocks();
  
  // Reset auth API mocks
  Object.values(mockAuthApi).forEach(mock => mock.mockReset());
  
  // Reset files API mocks
  Object.values(mockFilesApi).forEach(mock => mock.mockReset());
};

// Mock WebSocket for real-time features
export const createMockWebSocket = () => {
  const mockWs = {
    send: vi.fn(),
    close: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    readyState: 1, // OPEN
  };
  
  global.WebSocket = vi.fn(() => mockWs) as any;
  
  return mockWs;
};

// Mock File and Blob for file uploads
export const createMockFile = (name: string, content: string, type = 'text/plain') => {
  const file = new File([content], name, { type });
  Object.defineProperty(file, 'size', { value: content.length });
  return file;
};

export const createMockBlob = (content: string, type = 'text/plain') => {
  return new Blob([content], { type });
};

// Mock fetch for API calls
export const createMockFetch = (responses: Record<string, any>) => {
  return vi.fn().mockImplementation((url: string) => {
    const response = responses[url];
    if (response) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(response),
        text: () => Promise.resolve(JSON.stringify(response)),
      });
    }
    
    return Promise.resolve({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: 'Not found' }),
      text: () => Promise.resolve('Not found'),
    });
  });
};

// Mock localStorage
export const createMockLocalStorage = () => {
  const store: Record<string, string> = {};
  
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      Object.keys(store).forEach(key => delete store[key]);
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
  };
};

// Mock sessionStorage
export const createMockSessionStorage = () => {
  const store: Record<string, string> = {};
  
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      Object.keys(store).forEach(key => delete store[key]);
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
  };
};
