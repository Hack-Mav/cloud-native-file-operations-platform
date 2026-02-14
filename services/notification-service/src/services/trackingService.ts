import { deliveryRepository, auditRepository, notificationRepository } from '../database/datastore';
import { NotificationDelivery, NotificationAudit, Notification } from '../models/notification';
import { NotificationChannel, DeliveryStatus } from '../config/config';

export interface DeliveryStats {
  total: number;
  byStatus: Record<DeliveryStatus, number>;
  byChannel: Record<NotificationChannel, {
    total: number;
    delivered: number;
    failed: number;
    pending: number;
  }>;
  averageDeliveryTimeMs?: number;
}

export interface AuditEntry {
  id: string;
  notificationId: string;
  action: string;
  channel?: NotificationChannel;
  timestamp: Date;
  details?: Record<string, unknown>;
}

export class TrackingService {
  private static instance: TrackingService;

  private constructor() {}

  static getInstance(): TrackingService {
    if (!TrackingService.instance) {
      TrackingService.instance = new TrackingService();
    }
    return TrackingService.instance;
  }

  async getDeliveryStatus(notificationId: string): Promise<NotificationDelivery[]> {
    return deliveryRepository.findByNotification(notificationId);
  }

  async getDeliveryById(deliveryId: string): Promise<NotificationDelivery | null> {
    return deliveryRepository.findById(deliveryId);
  }

  async getAuditTrail(notificationId: string): Promise<NotificationAudit[]> {
    return auditRepository.findByNotification(notificationId);
  }

  async getUserAuditHistory(userId: string, limit: number = 100): Promise<NotificationAudit[]> {
    return auditRepository.findByUser(userId, limit);
  }

  async getNotificationHistory(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      includeDelivery?: boolean;
    } = {}
  ): Promise<Array<Notification & { deliveries?: NotificationDelivery[] }>> {
    const { limit = 50, offset = 0, includeDelivery = false } = options;

    const notifications = await notificationRepository.findByUser(userId, { limit, offset });

    if (!includeDelivery) {
      return notifications;
    }

    // Fetch deliveries for each notification
    const notificationsWithDelivery = await Promise.all(
      notifications.map(async (notification) => {
        const deliveries = await deliveryRepository.findByNotification(notification.id);
        return { ...notification, deliveries };
      })
    );

    return notificationsWithDelivery;
  }

  async getDeliveryStats(userId: string, fromDate?: Date, toDate?: Date): Promise<DeliveryStats> {
    // Get all notifications for the user in the date range
    const notifications = await notificationRepository.findByUser(userId, {
      fromDate,
      toDate,
      limit: 1000 // Reasonable limit
    });

    // Get all deliveries for these notifications
    const allDeliveries: NotificationDelivery[] = [];
    for (const notification of notifications) {
      const deliveries = await deliveryRepository.findByNotification(notification.id);
      allDeliveries.push(...deliveries);
    }

    // Calculate stats
    const stats: DeliveryStats = {
      total: allDeliveries.length,
      byStatus: {
        pending: 0,
        sent: 0,
        delivered: 0,
        failed: 0,
        bounced: 0
      },
      byChannel: {
        email: { total: 0, delivered: 0, failed: 0, pending: 0 },
        webhook: { total: 0, delivered: 0, failed: 0, pending: 0 },
        in_app: { total: 0, delivered: 0, failed: 0, pending: 0 },
        sms: { total: 0, delivered: 0, failed: 0, pending: 0 },
        push: { total: 0, delivered: 0, failed: 0, pending: 0 }
      }
    };

    let totalDeliveryTime = 0;
    let deliveredCount = 0;

    for (const delivery of allDeliveries) {
      // Count by status
      stats.byStatus[delivery.status]++;

      // Count by channel
      const channelStats = stats.byChannel[delivery.channel];
      channelStats.total++;

      if (delivery.status === 'delivered') {
        channelStats.delivered++;
        if (delivery.deliveredAt && delivery.createdAt) {
          totalDeliveryTime += new Date(delivery.deliveredAt).getTime() - new Date(delivery.createdAt).getTime();
          deliveredCount++;
        }
      } else if (delivery.status === 'failed' || delivery.status === 'bounced') {
        channelStats.failed++;
      } else if (delivery.status === 'pending') {
        channelStats.pending++;
      }
    }

    // Calculate average delivery time
    if (deliveredCount > 0) {
      stats.averageDeliveryTimeMs = Math.round(totalDeliveryTime / deliveredCount);
    }

    return stats;
  }

  async getPendingDeliveries(limit: number = 100): Promise<NotificationDelivery[]> {
    return deliveryRepository.getPendingDeliveries(limit);
  }

  async getFailedDeliveries(maxRetries: number = 3): Promise<NotificationDelivery[]> {
    return deliveryRepository.getFailedDeliveries(maxRetries);
  }

  async retryFailedDelivery(deliveryId: string): Promise<NotificationDelivery | null> {
    const delivery = await deliveryRepository.findById(deliveryId);

    if (!delivery || delivery.status !== 'failed') {
      return null;
    }

    // Reset to pending for retry
    return deliveryRepository.update(deliveryId, {
      status: 'pending',
      errorMessage: undefined
    });
  }

  async retryAllFailed(userId: string): Promise<number> {
    const notifications = await notificationRepository.findByUser(userId, { limit: 100 });
    let retryCount = 0;

    for (const notification of notifications) {
      const deliveries = await deliveryRepository.findByNotification(notification.id);

      for (const delivery of deliveries) {
        if (delivery.status === 'failed' && delivery.attempts < 3) {
          await this.retryFailedDelivery(delivery.id);
          retryCount++;
        }
      }
    }

    return retryCount;
  }

  async generateDeliveryReport(
    userId: string,
    fromDate: Date,
    toDate: Date
  ): Promise<{
    period: { from: Date; to: Date };
    stats: DeliveryStats;
    notifications: Array<{
      id: string;
      type: string;
      title: string;
      createdAt: Date;
      read: boolean;
      deliveryStatus: Record<NotificationChannel, DeliveryStatus>;
    }>;
  }> {
    const stats = await this.getDeliveryStats(userId, fromDate, toDate);
    const notifications = await notificationRepository.findByUser(userId, { fromDate, toDate, limit: 500 });

    const notificationSummaries = await Promise.all(
      notifications.map(async (n) => {
        const deliveries = await deliveryRepository.findByNotification(n.id);
        const deliveryStatus: Record<string, DeliveryStatus> = {};

        for (const d of deliveries) {
          deliveryStatus[d.channel] = d.status;
        }

        return {
          id: n.id,
          type: n.type,
          title: n.title,
          createdAt: n.createdAt,
          read: n.read,
          deliveryStatus: deliveryStatus as Record<NotificationChannel, DeliveryStatus>
        };
      })
    );

    return {
      period: { from: fromDate, to: toDate },
      stats,
      notifications: notificationSummaries
    };
  }

  // Log custom audit events

  async logAuditEvent(
    notificationId: string,
    action: string,
    userId: string,
    details?: Record<string, unknown>,
    options?: { channel?: NotificationChannel; tenantId?: string; ipAddress?: string; userAgent?: string }
  ): Promise<NotificationAudit> {
    return auditRepository.log({
      notificationId,
      action: action as any,
      userId,
      tenantId: options?.tenantId,
      channel: options?.channel,
      details,
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent
    });
  }
}

export const trackingService = TrackingService.getInstance();

export default trackingService;
