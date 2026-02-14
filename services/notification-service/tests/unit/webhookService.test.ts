import { WebhookService } from '../../src/services/webhookService';
import { webhookRepository, deliveryRepository, auditRepository } from '../../src/database/datastore';
import { Notification } from '../../src/models/notification';

// Mock the repositories
jest.mock('../../src/database/datastore', () => ({
  webhookRepository: {
    findById: jest.fn(),
    findByUser: jest.fn(),
    findActiveByEvent: jest.fn(),
    update: jest.fn()
  },
  deliveryRepository: {
    create: jest.fn(),
    update: jest.fn()
  },
  auditRepository: {
    log: jest.fn()
  }
}));

// Mock fetch
global.fetch = jest.fn();

describe('WebhookService', () => {
  let webhookService: WebhookService;
  const mockNotification: Notification = {
    id: 'notification-123',
    userId: 'user-123',
    type: 'file_uploaded',
    title: 'File Uploaded',
    message: 'Your file has been uploaded',
    priority: 'medium',
    channels: ['webhook'],
    read: false,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mockWebhook = {
    id: 'webhook-123',
    userId: 'user-123',
    url: 'https://example.com/webhook',
    secret: 'webhook-secret',
    events: ['file_uploaded'],
    active: true,
    failureCount: 0
  };

  beforeEach(() => {
    jest.clearAllMocks();
    webhookService = WebhookService.getInstance();

    (deliveryRepository.create as jest.Mock).mockResolvedValue({
      id: 'delivery-123',
      notificationId: 'notification-123',
      channel: 'webhook',
      status: 'pending',
      attempts: 0
    });

    (deliveryRepository.update as jest.Mock).mockImplementation((id, updates) => ({
      id,
      ...updates
    }));

    (auditRepository.log as jest.Mock).mockResolvedValue({ id: 'audit-123' });
  });

  describe('generateSignature', () => {
    it('should generate HMAC-SHA256 signature', () => {
      const payload = JSON.stringify({ test: 'data' });
      const secret = 'test-secret';

      const signature = webhookService.generateSignature(payload, secret);

      expect(signature).toMatch(/^sha256=[a-f0-9]+$/);
    });

    it('should generate consistent signatures', () => {
      const payload = 'test payload';
      const secret = 'secret';

      const sig1 = webhookService.generateSignature(payload, secret);
      const sig2 = webhookService.generateSignature(payload, secret);

      expect(sig1).toBe(sig2);
    });
  });

  describe('verifySignature', () => {
    it('should verify valid signature', () => {
      const payload = 'test payload';
      const secret = 'secret';
      const signature = webhookService.generateSignature(payload, secret);

      const isValid = webhookService.verifySignature(payload, signature, secret);

      expect(isValid).toBe(true);
    });

    it('should reject invalid signature', () => {
      const payload = 'test payload';
      const secret = 'secret';
      const invalidSignature = 'sha256=invalid';

      const isValid = webhookService.verifySignature(payload, invalidSignature, secret);

      expect(isValid).toBe(false);
    });
  });

  describe('createPayload', () => {
    it('should create webhook payload from notification', () => {
      const payload = webhookService.createPayload(mockNotification);

      expect(payload.type).toBe('file_uploaded');
      expect(payload.data.notificationId).toBe('notification-123');
      expect(payload.data.title).toBe('File Uploaded');
      expect(payload.data.message).toBe('Your file has been uploaded');
      expect(payload.data.priority).toBe('medium');
      expect(payload.timestamp).toBeDefined();
      expect(payload.id).toBeDefined();
    });
  });

  describe('deliverWebhook', () => {
    it('should deliver webhook successfully', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('OK')
      });

      (webhookRepository.update as jest.Mock).mockResolvedValue(mockWebhook);

      const result = await webhookService.deliverWebhook(mockWebhook, mockNotification);

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(global.fetch).toHaveBeenCalledWith(
        mockWebhook.url,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Webhook-Signature': expect.stringMatching(/^sha256=/),
            'X-Webhook-Id': mockWebhook.id
          })
        })
      );
    });

    it('should handle webhook failure', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error')
      });

      (webhookRepository.update as jest.Mock).mockResolvedValue({
        ...mockWebhook,
        failureCount: 1
      });

      const result = await webhookService.deliverWebhook(mockWebhook, mockNotification);

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(500);
    });

    it('should handle network errors', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      (webhookRepository.update as jest.Mock).mockResolvedValue({
        ...mockWebhook,
        failureCount: 1
      });

      const result = await webhookService.deliverWebhook(mockWebhook, mockNotification);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('should update delivery status on success', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('OK')
      });

      (webhookRepository.update as jest.Mock).mockResolvedValue(mockWebhook);

      await webhookService.deliverWebhook(mockWebhook, mockNotification);

      expect(deliveryRepository.update).toHaveBeenCalledWith(
        'delivery-123',
        expect.objectContaining({
          status: 'delivered',
          deliveredAt: expect.any(Date)
        })
      );
    });
  });

  describe('deliverToAllWebhooks', () => {
    it('should deliver to all matching webhooks', async () => {
      (webhookRepository.findActiveByEvent as jest.Mock).mockResolvedValue([
        { ...mockWebhook, id: 'webhook-1' },
        { ...mockWebhook, id: 'webhook-2' }
      ]);

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('OK')
      });

      (webhookRepository.update as jest.Mock).mockResolvedValue(mockWebhook);

      const results = await webhookService.deliverToAllWebhooks(mockNotification);

      expect(results.size).toBe(2);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should filter webhooks by user', async () => {
      (webhookRepository.findActiveByEvent as jest.Mock).mockResolvedValue([
        { ...mockWebhook, userId: 'user-123' },
        { ...mockWebhook, id: 'webhook-2', userId: 'other-user' }
      ]);

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('OK')
      });

      (webhookRepository.update as jest.Mock).mockResolvedValue(mockWebhook);

      const results = await webhookService.deliverToAllWebhooks(mockNotification);

      // Should only deliver to user-123's webhook
      expect(results.size).toBe(1);
    });
  });

  describe('testWebhook', () => {
    it('should send test webhook', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('OK')
      });

      const result = await webhookService.testWebhook(mockWebhook);

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(global.fetch).toHaveBeenCalledWith(
        mockWebhook.url,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-Event-Type': 'test'
          })
        })
      );
    });
  });
});
