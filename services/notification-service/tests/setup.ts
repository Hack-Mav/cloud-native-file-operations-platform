// Test setup file
import { jest } from '@jest/globals';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.EMAIL_ENABLED = 'false';
process.env.WEBHOOK_ENABLED = 'false';
process.env.GOOGLE_CLOUD_PROJECT = 'test-project';

// Mock Google Cloud Datastore
jest.mock('@google-cloud/datastore', () => {
  const mockDatastore = {
    key: jest.fn((path) => ({ path, name: path[1], kind: path[0] })),
    save: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue([null]),
    delete: jest.fn().mockResolvedValue(undefined),
    createQuery: jest.fn(() => ({
      filter: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis()
    })),
    runQuery: jest.fn().mockResolvedValue([[], {}]),
    KEY: Symbol('KEY')
  };

  return {
    Datastore: jest.fn(() => mockDatastore)
  };
});

// Mock Google Cloud Pub/Sub
jest.mock('@google-cloud/pubsub', () => {
  const mockSubscription = {
    exists: jest.fn().mockResolvedValue([true]),
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined)
  };

  const mockTopic = {
    publishMessage: jest.fn().mockResolvedValue('message-id'),
    createSubscription: jest.fn().mockResolvedValue([mockSubscription])
  };

  const mockPubSub = {
    subscription: jest.fn(() => mockSubscription),
    topic: jest.fn(() => mockTopic)
  };

  return {
    PubSub: jest.fn(() => mockPubSub)
  };
});

// Mock nodemailer
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    verify: jest.fn().mockResolvedValue(true),
    sendMail: jest.fn().mockResolvedValue({ messageId: 'test-message-id' }),
    close: jest.fn()
  }))
}));

// Mock Redis (if needed)
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1)
  }))
}));

// Global test timeout
jest.setTimeout(10000);

// Clean up after all tests
afterAll(async () => {
  // Add any global cleanup here
});
