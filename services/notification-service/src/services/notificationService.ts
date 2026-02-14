import { config, NotificationChannel, NotificationType, NotificationPriority } from '../config/config';
import { Notification, CreateNotificationInput, NotificationFilter, BulkNotificationInput } from '../models/notification';
import { notificationRepository, auditRepository, preferencesRepository } from '../database/datastore';
import { emailService } from './emailService';
import { webhookService } from './webhookService';
import { websocketHandler } from '../handlers/websocketHandler';
import { templateEngine } from '../templates/templateEngine';

interface SendNotificationInput {
  userId: string;
  tenantId?: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  priority?: NotificationPriority;
  channels?: NotificationChannel[];
  templateId?: string;
  expiresAt?: Date;
}

interface NotificationResult {
  notification: Notification;
  deliveryResults: Map<NotificationChannel, { success: boolean; error?: string }>;
}

export class NotificationService {
  private static instance: NotificationService;

  private constructor() {}

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  async send(input: SendNotificationInput): Promise<NotificationResult> {
    // Get user preferences
    const preferences = await preferencesRepository.get(input.userId);

    // Check if notifications are enabled
    if (!preferences.enabled) {
      throw new Error('Notifications are disabled for this user');
    }

    // Determine channels based on preferences and input
    let channels = input.channels || this.getChannelsForType(input.type, preferences);

    // Check quiet hours
    if (this.isInQuietHours(preferences) && input.priority !== 'urgent') {
      // During quiet hours, only deliver via in_app
      channels = channels.filter((c) => c === 'in_app');
    }

    // Filter channels based on user preferences
    channels = this.filterChannelsByPreferences(channels, preferences);

    // Create notification record
    const notification = await notificationRepository.create({
      userId: input.userId,
      tenantId: input.tenantId,
      type: input.type,
      title: input.title,
      message: input.message,
      data: input.data,
      priority: input.priority || 'medium',
      channels,
      templateId: input.templateId,
      expiresAt: input.expiresAt
    });

    // Log creation
    await auditRepository.log({
      notificationId: notification.id,
      action: 'created',
      userId: input.userId,
      tenantId: input.tenantId,
      details: { type: input.type, priority: input.priority, channels }
    });

    // Deliver to all channels
    const deliveryResults = await this.deliverToChannels(notification, preferences);

    return { notification, deliveryResults };
  }

  async sendBulk(input: BulkNotificationInput): Promise<Map<string, NotificationResult>> {
    const results = new Map<string, NotificationResult>();

    // Process in batches to avoid overwhelming the system
    const batchSize = config.notifications.maxBatchSize;

    for (let i = 0; i < input.userIds.length; i += batchSize) {
      const batch = input.userIds.slice(i, i + batchSize);

      const promises = batch.map(async (userId) => {
        try {
          const result = await this.send({
            userId,
            tenantId: input.tenantId,
            type: input.type,
            title: input.title,
            message: input.message,
            data: input.data,
            priority: input.priority,
            channels: input.channels,
            templateId: input.templateId
          });
          results.set(userId, result);
        } catch (error) {
          console.error(`Failed to send notification to user ${userId}:`, error);
        }
      });

      await Promise.all(promises);
    }

    return results;
  }

  private async deliverToChannels(
    notification: Notification,
    preferences: any
  ): Promise<Map<NotificationChannel, { success: boolean; error?: string }>> {
    const results = new Map<NotificationChannel, { success: boolean; error?: string }>();

    const deliveryPromises = notification.channels.map(async (channel) => {
      try {
        let success = false;
        let error: string | undefined;

        switch (channel) {
          case 'in_app':
            success = await websocketHandler.sendToUser(notification.userId, notification);
            // in_app is always considered successful even if user is offline
            // (notification is stored and will be delivered when they connect)
            success = true;
            break;

          case 'email':
            if (config.email.enabled) {
              const emailAddress = preferences.channels?.email?.address;
              if (emailAddress) {
                const emailResult = await emailService.sendNotificationEmail(notification, emailAddress);
                success = emailResult.success;
                error = emailResult.error;
              } else {
                error = 'No email address configured';
              }
            } else {
              error = 'Email service disabled';
            }
            break;

          case 'webhook':
            if (config.webhook.enabled) {
              const webhookResults = await webhookService.deliverToAllWebhooks(notification);
              // Consider successful if at least one webhook succeeded
              success = Array.from(webhookResults.values()).some((r) => r.success);
              if (!success && webhookResults.size > 0) {
                error = 'All webhook deliveries failed';
              } else if (webhookResults.size === 0) {
                // No webhooks configured, but don't consider it an error
                success = true;
              }
            } else {
              error = 'Webhook service disabled';
            }
            break;

          case 'sms':
          case 'push':
            // Not implemented yet
            error = `${channel} notifications not implemented`;
            break;
        }

        results.set(channel, { success, error });
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown error';
        results.set(channel, { success: false, error });
      }
    });

    await Promise.all(deliveryPromises);

    return results;
  }

  private getChannelsForType(type: NotificationType, preferences: any): NotificationChannel[] {
    const typeConfig = preferences.typePreferences?.[type];
    if (typeConfig && typeConfig.enabled) {
      return typeConfig.channels || config.notifications.defaultChannels;
    }
    return config.notifications.defaultChannels;
  }

  private filterChannelsByPreferences(
    channels: NotificationChannel[],
    preferences: any
  ): NotificationChannel[] {
    return channels.filter((channel) => {
      const channelConfig = preferences.channels?.[channel];
      return channelConfig?.enabled !== false;
    });
  }

  private isInQuietHours(preferences: any): boolean {
    const quietHours = preferences.quietHours;
    if (!quietHours?.enabled) {
      return false;
    }

    const now = new Date();
    // Simple implementation - could be enhanced with proper timezone handling
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const currentDay = now.getDay();

    // Check if current day is in quiet hours days
    if (!quietHours.days.includes(currentDay)) {
      return false;
    }

    // Check if current time is within quiet hours
    const start = quietHours.startTime;
    const end = quietHours.endTime;

    if (start <= end) {
      // Same day range (e.g., 09:00 - 17:00)
      return currentTime >= start && currentTime <= end;
    } else {
      // Overnight range (e.g., 22:00 - 08:00)
      return currentTime >= start || currentTime <= end;
    }
  }

  // Read operations

  async getNotifications(userId: string, filter: NotificationFilter = {}): Promise<Notification[]> {
    return notificationRepository.findByUser(userId, filter);
  }

  async getNotification(id: string, userId: string): Promise<Notification | null> {
    const notification = await notificationRepository.findById(id);
    if (notification && notification.userId === userId) {
      return notification;
    }
    return null;
  }

  async getUnreadCount(userId: string): Promise<number> {
    return notificationRepository.getUnreadCount(userId);
  }

  async markAsRead(id: string, userId: string): Promise<Notification | null> {
    const notification = await notificationRepository.markAsRead(id, userId);

    if (notification) {
      await auditRepository.log({
        notificationId: id,
        action: 'read',
        userId
      });
    }

    return notification;
  }

  async markAllAsRead(userId: string): Promise<number> {
    const count = await notificationRepository.markAllAsRead(userId);
    return count;
  }

  async deleteNotification(id: string, userId: string): Promise<boolean> {
    const deleted = await notificationRepository.delete(id, userId);

    if (deleted) {
      await auditRepository.log({
        notificationId: id,
        action: 'deleted',
        userId
      });
    }

    return deleted;
  }

  // Maintenance operations

  async cleanupExpiredNotifications(): Promise<number> {
    return notificationRepository.deleteExpired();
  }

  // Template operations

  renderNotification(type: NotificationType, variables: Record<string, unknown>): {
    subject: string;
    body: string;
    htmlBody?: string;
  } | null {
    return templateEngine.renderByType(type, variables as any);
  }
}

export const notificationService = NotificationService.getInstance();

export default notificationService;
