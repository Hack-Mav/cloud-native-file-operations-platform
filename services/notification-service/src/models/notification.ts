import { NotificationChannel, NotificationType, NotificationPriority, DeliveryStatus } from '../config/config';

export interface Notification {
  id: string;
  userId: string;
  tenantId?: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  priority: NotificationPriority;
  channels: NotificationChannel[];
  templateId?: string;
  read: boolean;
  readAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationDelivery {
  id: string;
  notificationId: string;
  channel: NotificationChannel;
  status: DeliveryStatus;
  recipientAddress?: string; // email address, webhook URL, device token, etc.
  attempts: number;
  lastAttemptAt?: Date;
  deliveredAt?: Date;
  failedAt?: Date;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationAudit {
  id: string;
  notificationId: string;
  action: 'created' | 'sent' | 'delivered' | 'read' | 'failed' | 'retried' | 'deleted';
  channel?: NotificationChannel;
  userId: string;
  tenantId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}

export interface CreateNotificationInput {
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

export interface NotificationFilter {
  userId?: string;
  tenantId?: string;
  type?: NotificationType | NotificationType[];
  priority?: NotificationPriority | NotificationPriority[];
  read?: boolean;
  channels?: NotificationChannel[];
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

export interface NotificationStats {
  total: number;
  unread: number;
  byType: Record<NotificationType, number>;
  byPriority: Record<NotificationPriority, number>;
  byChannel: Record<NotificationChannel, number>;
}

export interface BulkNotificationInput {
  userIds: string[];
  tenantId?: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  priority?: NotificationPriority;
  channels?: NotificationChannel[];
  templateId?: string;
}
