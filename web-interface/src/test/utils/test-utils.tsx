import { render, RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { lightTheme } from '@/theme';
import { ReactElement } from 'react';
import { vi } from 'vitest';

// Create a test query client
const createTestQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});

// Custom render function with providers
const AllTheProviders = ({ children }: { children: React.ReactNode }) => {
  const queryClient = createTestQueryClient();
  
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeProvider theme={lightTheme}>
          {children}
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

const customRender = (ui: ReactElement, options?: RenderOptions) =>
  render(ui, { wrapper: AllTheProviders, ...options });

// Re-export everything from testing-library
export * from '@testing-library/react';
export { customRender as render };

// Mock data generators
export const createMockUser = (overrides = {}) => ({
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  role: 'user' as const,
  tenantId: 'tenant-1',
  mfaEnabled: false,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  ...overrides,
});

export const createMockFile = (overrides = {}) => ({
  id: 'file-1',
  name: 'test-file.txt',
  path: '/test-file.txt',
  size: 1024,
  mimeType: 'text/plain',
  isFolder: false,
  parentId: null,
  ownerId: 'user-1',
  tenantId: 'tenant-1',
  tags: [],
  metadata: {},
  version: 1,
  checksum: 'abc123',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  ...overrides,
});

export const createMockFolder = (overrides = {}) => ({
  id: 'folder-1',
  name: 'Test Folder',
  path: '/Test Folder',
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
  childCount: 0,
  ...overrides,
});

export const createMockAuthTokens = (overrides = {}) => ({
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token',
  expiresIn: 3600,
  ...overrides,
});

// API response helpers
export const createMockApiResponse = (data: any, success = true) => ({
  success,
  data,
  error: success ? undefined : { code: 'ERROR', message: 'Test error' },
});

export const createMockPaginatedResponse = (items: any[], pagination = {}) => ({
  success: true,
  data: {
    items,
    pagination: {
      page: 1,
      pageSize: 50,
      total: items.length,
      totalPages: 1,
      ...pagination,
    },
  },
});

// Test helpers
export const waitForElementToBeRemoved = (element: HTMLElement) => {
  return new Promise((resolve) => {
    if (element && !element.isConnected) {
      return resolve(element);
    }
    
    const observer = new MutationObserver(() => {
      if (element && !element.isConnected) {
        observer.disconnect();
        resolve(element);
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  });
};

export const createMockFileList = (count: number) => 
  Array.from({ length: count }, (_, index) => 
    createMockFile({
      id: `file-${index + 1}`,
      name: `test-file-${index + 1}.txt`,
      path: `/test-file-${index + 1}.txt`,
    })
  );

export const createMockFolderList = (count: number) => 
  Array.from({ length: count }, (_, index) => 
    createMockFolder({
      id: `folder-${index + 1}`,
      name: `Test Folder ${index + 1}`,
      path: `/Test Folder ${index + 1}`,
    })
  );

// Event helpers
export const createMockDragEvent = (data: any) => {
  const event = new Event('dragstart', { bubbles: true });
  Object.defineProperty(event, 'dataTransfer', {
    value: {
      setData: vi.fn(),
      getData: vi.fn().mockReturnValue(JSON.stringify(data)),
    },
  });
  return event;
};

export const createMockDropEvent = (data: any) => {
  const event = new Event('drop', { bubbles: true });
  Object.defineProperty(event, 'dataTransfer', {
    value: {
      files: data.files || [],
      getData: vi.fn().mockReturnValue(JSON.stringify(data)),
    },
  });
  return event;
};

// Form helpers
export const fillForm = (form: HTMLElement, data: Record<string, string>) => {
  Object.entries(data).forEach(([name, value]) => {
    const input = form.querySelector(`[name="${name}"]`) as HTMLInputElement;
    if (input) {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
};

// Storage helpers
export const mockLocalStorage = () => {
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

// Intersection Observer mock
export const createMockIntersectionObserver = () => {
  interface ObserverEntry {
    element: Element;
  }
  
  const observers: ObserverEntry[] = [];
  
  const observe = vi.fn((element) => {
    observers.push({ element });
    // Simulate intersection immediately
    setTimeout(() => {
      const entry = {
        target: element,
        isIntersecting: true,
        intersectionRatio: 1,
        boundingClientRect: element.getBoundingClientRect(),
        intersectionRect: element.getBoundingClientRect(),
        time: Date.now(),
      };
      
      // Call the callback with the entry
      const mockInstance = vi.mocked(createMockIntersectionObserver);
      if (mockInstance.mock.results[0]?.value) {
        const callback = (mockInstance.mock.results[0].value as any).callback;
        if (callback) {
          callback([entry]);
        }
      }
    }, 0);
  });
  
  const unobserve = vi.fn((element) => {
    const index = observers.findIndex(obs => obs.element === element);
    if (index > -1) {
      observers.splice(index, 1);
    }
  });
  
  const disconnect = vi.fn(() => {
    observers.length = 0;
  });
  
  return vi.fn().mockImplementation(() => ({
    observe,
    unobserve,
    disconnect,
  }));
};

// Resize Observer mock
export const createMockResizeObserver = () => {
  const observers: Array<{ element: Element }> = [];
  
  const observe = vi.fn((element) => {
    observers.push({ element });
  });
  
  const unobserve = vi.fn((element) => {
    const index = observers.findIndex(obs => obs.element === element);
    if (index > -1) {
      observers.splice(index, 1);
    }
  });
  
  const disconnect = vi.fn(() => {
    observers.length = 0;
  });
  
  return vi.fn().mockImplementation(() => ({
    observe,
    unobserve,
    disconnect,
  }));
};
