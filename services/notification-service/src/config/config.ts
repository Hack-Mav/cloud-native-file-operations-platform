export const config = {
  server: {
    port: parseInt(process.env.PORT || '8083'),
    host: process.env.HOST || '0.0.0.0',
    env: process.env.NODE_ENV || 'development'
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'your-jwt-secret-key'
  },
  datastore: {
    projectId: process.env.GOOGLE_CLOUD_PROJECT || 'file-ops-platform',
    keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
  },
  pubsub: {
    projectId: process.env.GOOGLE_CLOUD_PROJECT || 'file-ops-platform',
    subscriptions: {
      notifications: process.env.PUBSUB_NOTIFICATION_SUBSCRIPTION || 'notification-subscription',
      processingEvents: process.env.PUBSUB_PROCESSING_SUBSCRIPTION || 'processing-events-subscription'
    },
    topics: {
      notifications: process.env.PUBSUB_NOTIFICATION_TOPIC || 'notification-topic',
      deadLetter: process.env.PUBSUB_DEAD_LETTER_TOPIC || 'notification-dead-letter'
    }
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0'),
    keyPrefix: 'notifications:'
  },
  email: {
    enabled: process.env.EMAIL_ENABLED === 'true',
    smtp: {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || ''
      }
    },
    from: {
      name: process.env.EMAIL_FROM_NAME || 'File Operations Platform',
      address: process.env.EMAIL_FROM_ADDRESS || 'noreply@fileops.example.com'
    },
    retryAttempts: parseInt(process.env.EMAIL_RETRY_ATTEMPTS || '3'),
    retryDelayMs: parseInt(process.env.EMAIL_RETRY_DELAY_MS || '1000')
  },
  webhook: {
    enabled: process.env.WEBHOOK_ENABLED === 'true',
    signingSecret: process.env.WEBHOOK_SIGNING_SECRET || 'webhook-signing-secret',
    timeoutMs: parseInt(process.env.WEBHOOK_TIMEOUT_MS || '30000'),
    retryAttempts: parseInt(process.env.WEBHOOK_RETRY_ATTEMPTS || '3'),
    retryDelayMs: parseInt(process.env.WEBHOOK_RETRY_DELAY_MS || '1000')
  },
  websocket: {
    pingInterval: parseInt(process.env.WS_PING_INTERVAL || '25000'),
    pingTimeout: parseInt(process.env.WS_PING_TIMEOUT || '20000'),
    cors: {
      origin: process.env.WS_CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
      credentials: true
    }
  },
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
  },
  notifications: {
    maxBatchSize: parseInt(process.env.NOTIFICATION_MAX_BATCH_SIZE || '100'),
    historyRetentionDays: parseInt(process.env.NOTIFICATION_HISTORY_RETENTION_DAYS || '90'),
    defaultChannels: ['in_app'] as NotificationChannel[]
  }
};

export type NotificationChannel = 'email' | 'webhook' | 'in_app' | 'sms' | 'push';

export type NotificationType =
  | 'file_uploaded'
  | 'file_processed'
  | 'file_shared'
  | 'file_deleted'
  | 'processing_started'
  | 'processing_completed'
  | 'processing_failed'
  | 'batch_completed'
  | 'system_alert'
  | 'security_alert'
  | 'custom';

export type NotificationPriority = 'low' | 'medium' | 'high' | 'urgent';

export type DeliveryStatus = 'pending' | 'sent' | 'delivered' | 'failed' | 'bounced';

export default config;
