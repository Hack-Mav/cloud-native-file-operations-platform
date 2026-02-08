// Test setup file
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.GOOGLE_CLOUD_PROJECT = 'test-project';
process.env.MFA_ISSUER = 'Test Platform';

// Mock Google Cloud Datastore for tests
jest.mock('@google-cloud/datastore', () => {
  return {
    Datastore: jest.fn().mockImplementation(() => ({
      createKey: jest.fn(),
      save: jest.fn(),
      get: jest.fn(),
      runQuery: jest.fn(),
      createQuery: jest.fn(() => ({
        filter: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
      })),
    })),
  };
});

// Mock bcrypt for tests
jest.mock('bcryptjs', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));