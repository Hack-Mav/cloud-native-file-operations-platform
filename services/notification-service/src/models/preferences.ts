import { NotificationChannel, NotificationType } from '../config/config';

export interface NotificationPreferences {
  userId: string;
  tenantId?: string;
  enabled: boolean;
  channels: ChannelPreferences;
  typePreferences: TypePreferences;
  quietHours?: QuietHours;
  digest?: DigestPreferences;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChannelPreferences {
  email: ChannelConfig;
  webhook: ChannelConfig;
  in_app: ChannelConfig;
  sms: ChannelConfig;
  push: ChannelConfig;
}

export interface ChannelConfig {
  enabled: boolean;
  address?: string; // email address, phone number, webhook URL, device token
  verified?: boolean;
  verifiedAt?: Date;
}

export interface TypePreferences {
  [key: string]: TypeConfig;
}

export interface TypeConfig {
  enabled: boolean;
  channels: NotificationChannel[];
  priority?: 'all' | 'high_only' | 'urgent_only';
}

export interface QuietHours {
  enabled: boolean;
  startTime: string; // HH:mm format
  endTime: string;   // HH:mm format
  timezone: string;
  allowUrgent: boolean;
  days: number[];    // 0-6, Sunday-Saturday
}

export interface DigestPreferences {
  enabled: boolean;
  frequency: 'hourly' | 'daily' | 'weekly';
  time?: string;     // HH:mm format for daily/weekly
  day?: number;      // 0-6 for weekly
  timezone: string;
  types: NotificationType[];
}

export interface UpdatePreferencesInput {
  enabled?: boolean;
  channels?: Partial<ChannelPreferences>;
  typePreferences?: Partial<TypePreferences>;
  quietHours?: Partial<QuietHours>;
  digest?: Partial<DigestPreferences>;
}

export interface WebhookRegistration {
  id: string;
  userId: string;
  tenantId?: string;
  url: string;
  secret: string;
  events: NotificationType[];
  active: boolean;
  headers?: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
  lastDeliveryAt?: Date;
  lastDeliveryStatus?: 'success' | 'failure';
  failureCount: number;
}

export interface CreateWebhookInput {
  url: string;
  events: NotificationType[];
  headers?: Record<string, string>;
}

export const DEFAULT_PREFERENCES: Omit<NotificationPreferences, 'userId' | 'tenantId' | 'createdAt' | 'updatedAt'> = {
  enabled: true,
  channels: {
    email: { enabled: true },
    webhook: { enabled: false },
    in_app: { enabled: true },
    sms: { enabled: false },
    push: { enabled: false }
  },
  typePreferences: {
    file_uploaded: { enabled: true, channels: ['in_app'] },
    file_processed: { enabled: true, channels: ['in_app', 'email'] },
    file_shared: { enabled: true, channels: ['in_app', 'email'] },
    file_deleted: { enabled: true, channels: ['in_app'] },
    processing_started: { enabled: true, channels: ['in_app'] },
    processing_completed: { enabled: true, channels: ['in_app', 'email'] },
    processing_failed: { enabled: true, channels: ['in_app', 'email'] },
    batch_completed: { enabled: true, channels: ['in_app', 'email'] },
    system_alert: { enabled: true, channels: ['in_app', 'email'], priority: 'high_only' },
    security_alert: { enabled: true, channels: ['in_app', 'email'], priority: 'all' },
    custom: { enabled: true, channels: ['in_app'] }
  },
  quietHours: {
    enabled: false,
    startTime: '22:00',
    endTime: '08:00',
    timezone: 'UTC',
    allowUrgent: true,
    days: [0, 1, 2, 3, 4, 5, 6]
  },
  digest: {
    enabled: false,
    frequency: 'daily',
    time: '09:00',
    timezone: 'UTC',
    types: []
  }
};
