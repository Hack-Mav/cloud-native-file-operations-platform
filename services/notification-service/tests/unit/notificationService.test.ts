import { NotificationService } from '../../src/services/notificationService';
import { notificationRepository, preferencesRepository, auditRepository } from '../../src/database/datastore';
import { DEFAULT_PREFERENCES } from '../../src/models/preferences';

// Mock the repositories
jest.mock('../../src/database/datastore', () => ({
  notificationRepository: {
    create: jest.fn(),
    findById: jest.fn(),
    findByUser: jest.fn(),
    markAsRead: jest.fn(),
    markAllAsRead: jest.fn(),
    delete: jest.fn(),
    getUnreadCount: jest.fn()
  },
  preferencesRepository: {
    get: jest.fn(),
    save: jest.fn()
  },
  auditRepository: {
    log: jest.fn()
  },
  deliveryRepository: {
    create: jest.fn(),
    update: jest.fn()
  }
}));

// Mock the handlers and services
jest.mock('../../src/handlers/websocketHandler', () => ({
  websocketHandler: {
    sendToUser: jest.fn().mockResolvedValue(true),
    isUserConnected: jest.fn().mockReturnValue(true)
  }
}));

jest.mock('../../src/services/emailService', () => ({
  emailService: {
    sendNotificationEmail: jest.fn().mockResolvedValue({ success: true, messageId: 'test-id' })
  }
}));

jest.mock('../../src/services/webhookService', () => ({
  webhookService: {
    deliverToAllWebhooks: jest.fn().mockResolvedValue(new Map())
  }
}));

describe('NotificationService', () => {
  let notificationService: NotificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    notificationService = NotificationService.getInstance();

    // Default mock for preferences
    (preferencesRepository.get as jest.Mock).mockResolvedValue({
      userId: 'user-123',
      enabled: true,
      channels: {
        email: { enabled: true, address: 'user@example.com' },
        in_app: { enabled: true },
        webhook: { enabled: false }
      },
      typePreferences: DEFAULT_PREFERENCES.typePreferences,
      quietHours: { enabled: false }
    });

    // Default mock for notification creation
    (notificationRepository.create as jest.Mock).mockImplementation((input) => ({
      id: 'notification-123',
      ...input,
      read: false,
      createdAt: new Date(),
      updatedAt: new Date()
    }));

    (auditRepository.log as jest.Mock).mockResolvedValue({
      id: 'audit-123',
      timestamp: new Date()
    });
  });

  describe('send', () => {
    it('should create and send a notification', async () => {
      const result = await notificationService.send({
        userId: 'user-123',
        type: 'file_uploaded',
        title: 'File Uploaded',
        message: 'Your file has been uploaded successfully',
        data: { fileName: 'test.pdf' }
      });

      expect(result.notification).toBeDefined();
      expect(result.notification.id).toBe('notification-123');
      expect(result.notification.userId).toBe('user-123');
      expect(result.notification.type).toBe('file_uploaded');
      expect(notificationRepository.create).toHaveBeenCalled();
      expect(auditRepository.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'created',
          userId: 'user-123'
        })
      );
    });

    it('should throw error when notifications are disabled', async () => {
      (preferencesRepository.get as jest.Mock).mockResolvedValue({
        userId: 'user-123',
        enabled: false
      });

      await expect(
        notificationService.send({
          userId: 'user-123',
          type: 'file_uploaded',
          title: 'Test',
          message: 'Test'
        })
      ).rejects.toThrow('Notifications are disabled');
    });

    it('should respect channel preferences', async () => {
      (preferencesRepository.get as jest.Mock).mockResolvedValue({
        userId: 'user-123',
        enabled: true,
        channels: {
          email: { enabled: false },
          in_app: { enabled: true },
          webhook: { enabled: false }
        },
        typePreferences: {
          file_uploaded: { enabled: true, channels: ['in_app', 'email'] }
        },
        quietHours: { enabled: false }
      });

      const result = await notificationService.send({
        userId: 'user-123',
        type: 'file_uploaded',
        title: 'Test',
        message: 'Test'
      });

      // Should only include in_app since email is disabled in preferences
      expect(result.notification.channels).toEqual(['in_app']);
    });

    it('should set default priority to medium', async () => {
      const result = await notificationService.send({
        userId: 'user-123',
        type: 'file_uploaded',
        title: 'Test',
        message: 'Test'
      });

      expect(result.notification.priority).toBe('medium');
    });
  });

  describe('getNotifications', () => {
    it('should fetch notifications for user', async () => {
      const mockNotifications = [
        { id: '1', userId: 'user-123', type: 'file_uploaded', read: false },
        { id: '2', userId: 'user-123', type: 'file_shared', read: true }
      ];
      (notificationRepository.findByUser as jest.Mock).mockResolvedValue(mockNotifications);

      const result = await notificationService.getNotifications('user-123');

      expect(result).toEqual(mockNotifications);
      expect(notificationRepository.findByUser).toHaveBeenCalledWith('user-123', {});
    });

    it('should apply filters', async () => {
      await notificationService.getNotifications('user-123', {
        read: false,
        type: 'file_uploaded',
        limit: 10
      });

      expect(notificationRepository.findByUser).toHaveBeenCalledWith('user-123', {
        read: false,
        type: 'file_uploaded',
        limit: 10
      });
    });
  });

  describe('markAsRead', () => {
    it('should mark notification as read', async () => {
      const mockNotification = {
        id: 'notification-123',
        userId: 'user-123',
        read: true,
        readAt: new Date()
      };
      (notificationRepository.markAsRead as jest.Mock).mockResolvedValue(mockNotification);

      const result = await notificationService.markAsRead('notification-123', 'user-123');

      expect(result).toEqual(mockNotification);
      expect(notificationRepository.markAsRead).toHaveBeenCalledWith('notification-123', 'user-123');
      expect(auditRepository.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'read',
          notificationId: 'notification-123'
        })
      );
    });

    it('should return null if notification not found', async () => {
      (notificationRepository.markAsRead as jest.Mock).mockResolvedValue(null);

      const result = await notificationService.markAsRead('invalid-id', 'user-123');

      expect(result).toBeNull();
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all notifications as read', async () => {
      (notificationRepository.markAllAsRead as jest.Mock).mockResolvedValue(5);

      const count = await notificationService.markAllAsRead('user-123');

      expect(count).toBe(5);
      expect(notificationRepository.markAllAsRead).toHaveBeenCalledWith('user-123');
    });
  });

  describe('deleteNotification', () => {
    it('should delete notification', async () => {
      (notificationRepository.delete as jest.Mock).mockResolvedValue(true);

      const result = await notificationService.deleteNotification('notification-123', 'user-123');

      expect(result).toBe(true);
      expect(auditRepository.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'deleted',
          notificationId: 'notification-123'
        })
      );
    });

    it('should return false if notification not found', async () => {
      (notificationRepository.delete as jest.Mock).mockResolvedValue(false);

      const result = await notificationService.deleteNotification('invalid-id', 'user-123');

      expect(result).toBe(false);
    });
  });

  describe('getUnreadCount', () => {
    it('should return unread count', async () => {
      (notificationRepository.getUnreadCount as jest.Mock).mockResolvedValue(10);

      const count = await notificationService.getUnreadCount('user-123');

      expect(count).toBe(10);
      expect(notificationRepository.getUnreadCount).toHaveBeenCalledWith('user-123');
    });
  });
});
