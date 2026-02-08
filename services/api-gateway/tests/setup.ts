import { jest } from '@jest/globals';

// Mock Redis
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    setEx: jest.fn().mockResolvedValue('OK'),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    del: jest.fn().mockResolvedValue(1),
    keys: jest.fn().mockResolvedValue([]),
    multi: jest.fn(() => ({
      incr: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([1, 1])
    }))
  }))
}));

// Mock fetch for health checks
global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.VALID_API_KEYS = 'test-api-key-1,test-api-key-2';

// Increase timeout for integration tests
jest.setTimeout(10000);

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});

// Global test utilities
export const mockRequest = (overrides: any = {}) => ({
  method: 'GET',
  url: '/test',
  originalUrl: '/test',
  path: '/test',
  headers: {},
  query: {},
  params: {},
  body: {},
  ip: '127.0.0.1',
  connection: { remoteAddress: '127.0.0.1' },
  correlationId: 'test-correlation-id',
  apiVersion: 'v1',
  ...overrides
});

export const mockResponse = () => {
  const res: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    getHeader: jest.fn(),
    getHeaders: jest.fn().mockReturnValue({}),
    end: jest.fn(),
    headersSent: false
  };
  return res;
};

export const mockNext = jest.fn();