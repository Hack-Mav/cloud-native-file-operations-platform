import {
  NotificationPreferences,
  UpdatePreferencesInput,
  WebhookRegistration,
  CreateWebhookInput,
  DEFAULT_PREFERENCES
} from '../models/preferences';
import { preferencesRepository, webhookRepository } from '../database/datastore';
import { webhookService } from './webhookService';
import { NotificationChannel, NotificationType } from '../config/config';

export class PreferencesService {
  private static instance: PreferencesService;

  private constructor() {}

  static getInstance(): PreferencesService {
    if (!PreferencesService.instance) {
      PreferencesService.instance = new PreferencesService();
    }
    return PreferencesService.instance;
  }

  async getPreferences(userId: string): Promise<NotificationPreferences> {
    return preferencesRepository.get(userId);
  }

  async updatePreferences(
    userId: string,
    updates: UpdatePreferencesInput
  ): Promise<NotificationPreferences> {
    const current = await preferencesRepository.get(userId);

    // Deep merge updates
    const merged: NotificationPreferences = {
      ...current,
      enabled: updates.enabled ?? current.enabled,
      channels: {
        ...current.channels,
        ...(updates.channels || {})
      },
      typePreferences: {
        ...current.typePreferences,
        ...(updates.typePreferences || {})
      },
      quietHours: updates.quietHours
        ? { ...current.quietHours, ...updates.quietHours }
        : current.quietHours,
      digest: updates.digest
        ? { ...current.digest, ...updates.digest }
        : current.digest,
      updatedAt: new Date()
    };

    return preferencesRepository.save(merged);
  }

  async resetPreferences(userId: string): Promise<NotificationPreferences> {
    const now = new Date();
    const defaults: NotificationPreferences = {
      userId,
      ...DEFAULT_PREFERENCES,
      createdAt: now,
      updatedAt: now
    };

    return preferencesRepository.save(defaults);
  }

  async enableChannel(
    userId: string,
    channel: NotificationChannel,
    address?: string
  ): Promise<NotificationPreferences> {
    const preferences = await preferencesRepository.get(userId);

    preferences.channels[channel] = {
      ...preferences.channels[channel],
      enabled: true,
      address: address || preferences.channels[channel]?.address
    };

    return preferencesRepository.save(preferences);
  }

  async disableChannel(userId: string, channel: NotificationChannel): Promise<NotificationPreferences> {
    const preferences = await preferencesRepository.get(userId);

    preferences.channels[channel] = {
      ...preferences.channels[channel],
      enabled: false
    };

    return preferencesRepository.save(preferences);
  }

  async verifyChannel(userId: string, channel: NotificationChannel): Promise<NotificationPreferences> {
    const preferences = await preferencesRepository.get(userId);

    preferences.channels[channel] = {
      ...preferences.channels[channel],
      verified: true,
      verifiedAt: new Date()
    };

    return preferencesRepository.save(preferences);
  }

  async updateTypePreference(
    userId: string,
    type: NotificationType,
    config: { enabled?: boolean; channels?: NotificationChannel[]; priority?: 'all' | 'high_only' | 'urgent_only' }
  ): Promise<NotificationPreferences> {
    const preferences = await preferencesRepository.get(userId);

    preferences.typePreferences[type] = {
      ...preferences.typePreferences[type],
      ...config
    };

    return preferencesRepository.save(preferences);
  }

  async setQuietHours(
    userId: string,
    quietHours: {
      enabled: boolean;
      startTime?: string;
      endTime?: string;
      timezone?: string;
      allowUrgent?: boolean;
      days?: number[];
    }
  ): Promise<NotificationPreferences> {
    const preferences = await preferencesRepository.get(userId);

    preferences.quietHours = {
      ...preferences.quietHours!,
      ...quietHours
    };

    return preferencesRepository.save(preferences);
  }

  async setDigestPreferences(
    userId: string,
    digest: {
      enabled: boolean;
      frequency?: 'hourly' | 'daily' | 'weekly';
      time?: string;
      day?: number;
      timezone?: string;
      types?: NotificationType[];
    }
  ): Promise<NotificationPreferences> {
    const preferences = await preferencesRepository.get(userId);

    preferences.digest = {
      ...preferences.digest!,
      ...digest
    };

    return preferencesRepository.save(preferences);
  }

  // Webhook management

  async getWebhooks(userId: string): Promise<WebhookRegistration[]> {
    return webhookRepository.findByUser(userId);
  }

  async createWebhook(
    userId: string,
    input: CreateWebhookInput,
    tenantId?: string
  ): Promise<WebhookRegistration> {
    // Validate URL
    try {
      new URL(input.url);
    } catch {
      throw new Error('Invalid webhook URL');
    }

    // Check for duplicate URL
    const existing = await webhookRepository.findByUser(userId);
    if (existing.some((w) => w.url === input.url)) {
      throw new Error('Webhook with this URL already exists');
    }

    return webhookRepository.create(userId, input, tenantId);
  }

  async updateWebhook(
    userId: string,
    webhookId: string,
    updates: { url?: string; events?: NotificationType[]; active?: boolean; headers?: Record<string, string> }
  ): Promise<WebhookRegistration | null> {
    const webhook = await webhookRepository.findById(webhookId);

    if (!webhook || webhook.userId !== userId) {
      return null;
    }

    return webhookRepository.update(webhookId, updates);
  }

  async deleteWebhook(userId: string, webhookId: string): Promise<boolean> {
    return webhookRepository.delete(webhookId, userId);
  }

  async testWebhook(userId: string, webhookId: string): Promise<{
    success: boolean;
    statusCode?: number;
    duration?: number;
    error?: string;
  }> {
    const webhook = await webhookRepository.findById(webhookId);

    if (!webhook || webhook.userId !== userId) {
      throw new Error('Webhook not found');
    }

    return webhookService.testWebhook(webhook);
  }

  async regenerateWebhookSecret(userId: string, webhookId: string): Promise<WebhookRegistration | null> {
    const webhook = await webhookRepository.findById(webhookId);

    if (!webhook || webhook.userId !== userId) {
      return null;
    }

    const newSecret = require('crypto').randomUUID();
    return webhookRepository.update(webhookId, { secret: newSecret });
  }

  // Available channels info

  getAvailableChannels(): Array<{
    channel: NotificationChannel;
    name: string;
    description: string;
    requiresAddress: boolean;
    requiresVerification: boolean;
  }> {
    return [
      {
        channel: 'in_app',
        name: 'In-App Notifications',
        description: 'Real-time notifications within the application',
        requiresAddress: false,
        requiresVerification: false
      },
      {
        channel: 'email',
        name: 'Email',
        description: 'Email notifications to your registered address',
        requiresAddress: true,
        requiresVerification: true
      },
      {
        channel: 'webhook',
        name: 'Webhooks',
        description: 'HTTP callbacks to external endpoints',
        requiresAddress: true,
        requiresVerification: false
      },
      {
        channel: 'sms',
        name: 'SMS',
        description: 'Text message notifications (coming soon)',
        requiresAddress: true,
        requiresVerification: true
      },
      {
        channel: 'push',
        name: 'Push Notifications',
        description: 'Mobile and desktop push notifications (coming soon)',
        requiresAddress: false,
        requiresVerification: false
      }
    ];
  }

  getNotificationTypes(): Array<{
    type: NotificationType;
    name: string;
    description: string;
    defaultChannels: NotificationChannel[];
  }> {
    return [
      {
        type: 'file_uploaded',
        name: 'File Uploaded',
        description: 'When a file upload completes',
        defaultChannels: ['in_app']
      },
      {
        type: 'file_processed',
        name: 'File Processed',
        description: 'When file processing completes',
        defaultChannels: ['in_app', 'email']
      },
      {
        type: 'file_shared',
        name: 'File Shared',
        description: 'When someone shares a file with you',
        defaultChannels: ['in_app', 'email']
      },
      {
        type: 'file_deleted',
        name: 'File Deleted',
        description: 'When a file is deleted',
        defaultChannels: ['in_app']
      },
      {
        type: 'processing_started',
        name: 'Processing Started',
        description: 'When file processing begins',
        defaultChannels: ['in_app']
      },
      {
        type: 'processing_completed',
        name: 'Processing Completed',
        description: 'When processing completes successfully',
        defaultChannels: ['in_app', 'email']
      },
      {
        type: 'processing_failed',
        name: 'Processing Failed',
        description: 'When processing fails',
        defaultChannels: ['in_app', 'email']
      },
      {
        type: 'batch_completed',
        name: 'Batch Completed',
        description: 'When batch processing completes',
        defaultChannels: ['in_app', 'email']
      },
      {
        type: 'system_alert',
        name: 'System Alerts',
        description: 'Important system notifications',
        defaultChannels: ['in_app', 'email']
      },
      {
        type: 'security_alert',
        name: 'Security Alerts',
        description: 'Security-related notifications',
        defaultChannels: ['in_app', 'email']
      }
    ];
  }
}

export const preferencesService = PreferencesService.getInstance();

export default preferencesService;
