import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { notificationRoutes } from '../../src/routes/notifications';
import { errorHandler } from '../../src/middleware/errors';

// Create test app
const app = express();
app.use(express.json());
app.use('/api/notifications', notificationRoutes);
app.use(errorHandler);

// Mock services
jest.mock('../../src/services/notificationService', () => ({
  notificationService: {
    send: jest.fn().mockResolvedValue({
      notification: {
        id: 'notification-123',
        userId: 'user-123',
        type: 'file_uploaded',
        title: 'Test',
        message: 'Test message',
        priority: 'medium',
        channels: ['in_app'],
        read: false,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      deliveryResults: new Map([['in_app', { success: true }]])
    }),
    getNotifications: jest.fn().mockResolvedValue([]),
    getNotification: jest.fn().mockResolvedValue(null),
    markAsRead: jest.fn().mockResolvedValue(null),
    markAllAsRead: jest.fn().mockResolvedValue(0),
    deleteNotification: jest.fn().mockResolvedValue(false),
    getUnreadCount: jest.fn().mockResolvedValue(0)
  }
}));

jest.mock('../../src/services/preferencesService', () => ({
  preferencesService: {
    getPreferences: jest.fn().mockResolvedValue({
      userId: 'user-123',
      enabled: true,
      channels: {}
    }),
    updatePreferences: jest.fn().mockImplementation((userId, updates) => ({
      userId,
      ...updates
    })),
    resetPreferences: jest.fn().mockResolvedValue({ userId: 'user-123', enabled: true }),
    getAvailableChannels: jest.fn().mockReturnValue([
      { channel: 'email', name: 'Email', description: 'Email notifications', requiresAddress: true, requiresVerification: true },
      { channel: 'in_app', name: 'In-App', description: 'In-app notifications', requiresAddress: false, requiresVerification: false }
    ]),
    getNotificationTypes: jest.fn().mockReturnValue([
      { type: 'file_uploaded', name: 'File Uploaded', description: 'When a file is uploaded', defaultChannels: ['in_app'] }
    ]),
    getWebhooks: jest.fn().mockResolvedValue([]),
    createWebhook: jest.fn().mockResolvedValue({
      id: 'webhook-123',
      url: 'https://example.com/webhook',
      events: ['file_uploaded'],
      active: true
    }),
    deleteWebhook: jest.fn().mockResolvedValue(false)
  }
}));

jest.mock('../../src/services/trackingService', () => ({
  trackingService: {
    getDeliveryStatus: jest.fn().mockResolvedValue([]),
    getAuditTrail: jest.fn().mockResolvedValue([]),
    getUserAuditHistory: jest.fn().mockResolvedValue([]),
    getDeliveryStats: jest.fn().mockResolvedValue({
      total: 0,
      byStatus: {},
      byChannel: {}
    }),
    getNotificationHistory: jest.fn().mockResolvedValue([])
  }
}));

// Import mocked services
import { notificationService } from '../../src/services/notificationService';
import { preferencesService } from '../../src/services/preferencesService';

describe('Notification API', () => {
  const validToken = jwt.sign(
    { userId: 'user-123', email: 'user@example.com', role: 'user' },
    'test-jwt-secret',
    { expiresIn: '1h' }
  );

  const adminToken = jwt.sign(
    { userId: 'admin-123', email: 'admin@example.com', role: 'admin' },
    'test-jwt-secret',
    { expiresIn: '1h' }
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/notifications', () => {
    it('should require authentication', async () => {
      const response = await request(app).get('/api/notifications');

      expect(response.status).toBe(401);
    });

    it('should return notifications for authenticated user', async () => {
      (notificationService.getNotifications as jest.Mock).mockResolvedValue([
        { id: '1', userId: 'user-123', type: 'file_uploaded', read: false }
      ]);

      const response = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.notifications).toBeDefined();
      expect(notificationService.getNotifications).toHaveBeenCalledWith('user-123', expect.anything());
    });

    it('should support pagination parameters', async () => {
      const response = await request(app)
        .get('/api/notifications?limit=10&offset=5')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.pagination.limit).toBe(10);
      expect(response.body.pagination.offset).toBe(5);
    });
  });

  describe('GET /api/notifications/unread/count', () => {
    it('should return unread count', async () => {
      (notificationService.getUnreadCount as jest.Mock).mockResolvedValue(5);

      const response = await request(app)
        .get('/api/notifications/unread/count')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.count).toBe(5);
    });
  });

  describe('POST /api/notifications', () => {
    it('should require admin role', async () => {
      const response = await request(app)
        .post('/api/notifications')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          userId: 'user-456',
          type: 'file_uploaded',
          title: 'Test',
          message: 'Test message'
        });

      expect(response.status).toBe(403);
    });

    it('should create notification with admin role', async () => {
      const response = await request(app)
        .post('/api/notifications')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: 'user-456',
          type: 'file_uploaded',
          title: 'Test',
          message: 'Test message'
        });

      expect(response.status).toBe(201);
      expect(response.body.notification).toBeDefined();
      expect(notificationService.send).toHaveBeenCalled();
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/notifications')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: 'user-456'
          // missing type, title, message
        });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/notifications/:id/read', () => {
    it('should mark notification as read', async () => {
      (notificationService.markAsRead as jest.Mock).mockResolvedValue({
        id: 'notification-123',
        read: true,
        readAt: new Date()
      });

      const response = await request(app)
        .post('/api/notifications/notification-123/read')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.notification.read).toBe(true);
    });

    it('should return 404 if notification not found', async () => {
      (notificationService.markAsRead as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .post('/api/notifications/invalid-id/read')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/notifications/:id', () => {
    it('should delete notification', async () => {
      (notificationService.deleteNotification as jest.Mock).mockResolvedValue(true);

      const response = await request(app)
        .delete('/api/notifications/notification-123')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(204);
    });

    it('should return 404 if notification not found', async () => {
      (notificationService.deleteNotification as jest.Mock).mockResolvedValue(false);

      const response = await request(app)
        .delete('/api/notifications/invalid-id')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/notifications/preferences', () => {
    it('should return user preferences', async () => {
      const response = await request(app)
        .get('/api/notifications/preferences')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.preferences).toBeDefined();
    });
  });

  describe('PUT /api/notifications/preferences', () => {
    it('should update preferences', async () => {
      const response = await request(app)
        .put('/api/notifications/preferences')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ enabled: false });

      expect(response.status).toBe(200);
      expect(preferencesService.updatePreferences).toHaveBeenCalledWith('user-123', { enabled: false });
    });
  });

  describe('GET /api/notifications/preferences/channels', () => {
    it('should return available channels', async () => {
      const response = await request(app)
        .get('/api/notifications/preferences/channels')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.channels).toBeInstanceOf(Array);
    });
  });

  describe('POST /api/notifications/webhooks', () => {
    it('should create webhook', async () => {
      const response = await request(app)
        .post('/api/notifications/webhooks')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          url: 'https://example.com/webhook',
          events: ['file_uploaded']
        });

      expect(response.status).toBe(201);
      expect(response.body.webhook).toBeDefined();
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/notifications/webhooks')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          url: 'https://example.com/webhook'
          // missing events
        });

      expect(response.status).toBe(400);
    });
  });
});
