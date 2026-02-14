import { PreferencesService } from '../../src/services/preferencesService';
import { preferencesRepository, webhookRepository } from '../../src/database/datastore';
import { DEFAULT_PREFERENCES } from '../../src/models/preferences';

// Mock the repositories
jest.mock('../../src/database/datastore', () => ({
  preferencesRepository: {
    get: jest.fn(),
    save: jest.fn()
  },
  webhookRepository: {
    create: jest.fn(),
    findById: jest.fn(),
    findByUser: jest.fn(),
    update: jest.fn(),
    delete: jest.fn()
  }
}));

jest.mock('../../src/services/webhookService', () => ({
  webhookService: {
    testWebhook: jest.fn().mockResolvedValue({ success: true, statusCode: 200, duration: 100 })
  }
}));

describe('PreferencesService', () => {
  let preferencesService: PreferencesService;
  const mockUserId = 'user-123';

  beforeEach(() => {
    jest.clearAllMocks();
    preferencesService = PreferencesService.getInstance();

    // Default mock
    (preferencesRepository.get as jest.Mock).mockResolvedValue({
      userId: mockUserId,
      ...DEFAULT_PREFERENCES,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    (preferencesRepository.save as jest.Mock).mockImplementation((prefs) => ({
      ...prefs,
      updatedAt: new Date()
    }));
  });

  describe('getPreferences', () => {
    it('should return user preferences', async () => {
      const preferences = await preferencesService.getPreferences(mockUserId);

      expect(preferences.userId).toBe(mockUserId);
      expect(preferences.enabled).toBe(true);
      expect(preferencesRepository.get).toHaveBeenCalledWith(mockUserId);
    });
  });

  describe('updatePreferences', () => {
    it('should update preferences with provided values', async () => {
      const updates = {
        enabled: false,
        channels: {
          email: { enabled: false }
        }
      };

      const result = await preferencesService.updatePreferences(mockUserId, updates);

      expect(result.enabled).toBe(false);
      expect(result.channels.email.enabled).toBe(false);
      expect(preferencesRepository.save).toHaveBeenCalled();
    });

    it('should merge updates with existing preferences', async () => {
      const result = await preferencesService.updatePreferences(mockUserId, {
        quietHours: { enabled: true }
      });

      // Should preserve existing quiet hours settings
      expect(result.quietHours?.enabled).toBe(true);
      expect(result.quietHours?.startTime).toBeDefined();
    });
  });

  describe('resetPreferences', () => {
    it('should reset to default preferences', async () => {
      const result = await preferencesService.resetPreferences(mockUserId);

      expect(result.enabled).toBe(DEFAULT_PREFERENCES.enabled);
      expect(preferencesRepository.save).toHaveBeenCalled();
    });
  });

  describe('enableChannel', () => {
    it('should enable a channel', async () => {
      const result = await preferencesService.enableChannel(mockUserId, 'sms', '+1234567890');

      expect(result.channels.sms.enabled).toBe(true);
      expect(result.channels.sms.address).toBe('+1234567890');
    });
  });

  describe('disableChannel', () => {
    it('should disable a channel', async () => {
      const result = await preferencesService.disableChannel(mockUserId, 'email');

      expect(result.channels.email.enabled).toBe(false);
    });
  });

  describe('setQuietHours', () => {
    it('should set quiet hours', async () => {
      const result = await preferencesService.setQuietHours(mockUserId, {
        enabled: true,
        startTime: '22:00',
        endTime: '07:00',
        timezone: 'America/New_York'
      });

      expect(result.quietHours?.enabled).toBe(true);
      expect(result.quietHours?.startTime).toBe('22:00');
      expect(result.quietHours?.endTime).toBe('07:00');
    });
  });

  describe('webhooks', () => {
    beforeEach(() => {
      (webhookRepository.findByUser as jest.Mock).mockResolvedValue([]);
      (webhookRepository.create as jest.Mock).mockImplementation((userId, input) => ({
        id: 'webhook-123',
        userId,
        url: input.url,
        events: input.events,
        secret: 'generated-secret',
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        failureCount: 0
      }));
    });

    it('should create a webhook', async () => {
      const webhook = await preferencesService.createWebhook(mockUserId, {
        url: 'https://example.com/webhook',
        events: ['file_uploaded', 'file_processed']
      });

      expect(webhook.id).toBe('webhook-123');
      expect(webhook.url).toBe('https://example.com/webhook');
      expect(webhookRepository.create).toHaveBeenCalled();
    });

    it('should reject invalid webhook URL', async () => {
      await expect(
        preferencesService.createWebhook(mockUserId, {
          url: 'not-a-valid-url',
          events: ['file_uploaded']
        })
      ).rejects.toThrow('Invalid webhook URL');
    });

    it('should reject duplicate webhook URL', async () => {
      (webhookRepository.findByUser as jest.Mock).mockResolvedValue([
        { url: 'https://example.com/webhook' }
      ]);

      await expect(
        preferencesService.createWebhook(mockUserId, {
          url: 'https://example.com/webhook',
          events: ['file_uploaded']
        })
      ).rejects.toThrow('Webhook with this URL already exists');
    });

    it('should delete a webhook', async () => {
      (webhookRepository.delete as jest.Mock).mockResolvedValue(true);

      const result = await preferencesService.deleteWebhook(mockUserId, 'webhook-123');

      expect(result).toBe(true);
      expect(webhookRepository.delete).toHaveBeenCalledWith('webhook-123', mockUserId);
    });
  });

  describe('getAvailableChannels', () => {
    it('should return all available channels', () => {
      const channels = preferencesService.getAvailableChannels();

      expect(channels.length).toBeGreaterThan(0);
      expect(channels.some(c => c.channel === 'email')).toBe(true);
      expect(channels.some(c => c.channel === 'in_app')).toBe(true);
      expect(channels.some(c => c.channel === 'webhook')).toBe(true);
    });
  });

  describe('getNotificationTypes', () => {
    it('should return all notification types', () => {
      const types = preferencesService.getNotificationTypes();

      expect(types.length).toBeGreaterThan(0);
      expect(types.some(t => t.type === 'file_uploaded')).toBe(true);
      expect(types.some(t => t.type === 'processing_completed')).toBe(true);
    });
  });
});
